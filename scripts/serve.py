#!/usr/bin/env python3
"""Local hub server: static files + Notion proxy + library sync + scrape."""

from __future__ import annotations

import importlib.util
import json
import mimetypes
import re
import threading
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
PORT = 5173
NOTION_VERSION = "2022-06-28"
CUSTOM_SOURCES_PATH = ROOT / "data" / "custom-sources.json"
SCRAPE_LOCK = threading.Lock()


def load_scrape_module():
    path = ROOT / "scripts" / "scrape_opportunities.py"
    spec = importlib.util.spec_from_file_location("scrape_opportunities", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def read_json_list(path: Path) -> list:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:48]


def name_from_url(url: str) -> str:
    try:
        host = urlparse(url).hostname or url
        return host.replace("www.", "")
    except Exception:
        return url


def notion_request(token: str, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.notion.com/v1{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail) if detail else {"error": err.reason}
        except json.JSONDecodeError:
            parsed = {"error": detail or err.reason}
        return err.code, parsed


def build_notion_properties(schema: dict, body: dict) -> dict:
    props_meta = schema.get("properties") or {}
    title_name = next(
        (name for name, meta in props_meta.items() if meta.get("type") == "title"),
        "Name",
    )
    by_lower = {name.lower(): name for name in props_meta}

    def resolve(*candidates: str) -> str | None:
        for cand in candidates:
            if cand in props_meta:
                return cand
            if cand.lower() in by_lower:
                return by_lower[cand.lower()]
        return None

    out: dict = {
        title_name: {
            "title": [{"text": {"content": str(body.get("title") or "Untitled")[:2000]}}]
        }
    }

    url_name = resolve("URL", "Link", "Url")
    if url_name and props_meta[url_name].get("type") == "url":
        out[url_name] = {"url": body.get("url") or None}

    deadline_name = resolve("Deadline", "Due", "Date")
    if deadline_name and props_meta[deadline_name].get("type") == "rich_text":
        out[deadline_name] = {
            "rich_text": [
                {"text": {"content": str(body.get("deadline") or "Open")[:200]}}
            ]
        }

    source_name = resolve("Source", "Website", "Site")
    if source_name and props_meta[source_name].get("type") == "rich_text":
        out[source_name] = {
            "rich_text": [{"text": {"content": str(body.get("source") or "")[:200]}}]
        }

    type_name = resolve("Type", "Category")
    if type_name and props_meta[type_name].get("type") == "rich_text":
        out[type_name] = {
            "rich_text": [
                {"text": {"content": str(body.get("type") or "opportunity")[:100]}}
            ]
        }

    return out


class HubHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/sources":
            custom = read_json_list(CUSTOM_SOURCES_PATH)
            self._json(200, {"sources": custom})
            return
        if path == "/api/scrape-meta":
            meta_path = ROOT / "data" / "scrape-meta.json"
            if meta_path.exists():
                try:
                    self._json(200, json.loads(meta_path.read_text(encoding="utf-8")))
                    return
                except Exception:
                    pass
            self._json(200, {"sources": {}, "total": 0})
            return
        return super().do_GET()

    def do_DELETE(self):
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)
        source_id = ""
        if path.startswith("/api/sources/"):
            source_id = path[len("/api/sources/") :]
        elif path == "/api/sources":
            source_id = (qs.get("id") or [""])[0]

        if not source_id:
            self.send_error(404)
            return

        custom = read_json_list(CUSTOM_SOURCES_PATH)
        next_list = [s for s in custom if s.get("id") != source_id]
        write_json(CUSTOM_SOURCES_PATH, next_list)

        opp_path = ROOT / "data" / "opportunities.json"
        opps = read_json_list(opp_path)
        write_json(opp_path, [o for o in opps if o.get("sourceId") != source_id])
        self._json(200, {"ok": True, "removed": source_id, "remaining": len(next_list)})

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

        if path == "/api/sources":
            self._add_source(body)
            return
        if path == "/api/scrape":
            self._run_scrape(body)
            return
        if path in {"/api/save-to-notion", "/api/test-notion"}:
            self._notion(path, body)
            return
        self.send_error(404)

    def _add_source(self, body: dict):
        url = str(body.get("url") or "").strip()
        if not url:
            self._json(400, {"error": "url required"})
            return
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        name = str(body.get("name") or "").strip() or name_from_url(url)
        source_id = str(body.get("id") or f"custom-{slugify(name) or 'source'}").strip()
        custom = read_json_list(CUSTOM_SOURCES_PATH)

        if any(s.get("url") == url for s in custom):
            existing = next(s for s in custom if s.get("url") == url)
            scrape = bool(body.get("scrape", True))
            report = None
            if scrape:
                report = self._scrape_locked([existing["id"]])
            self._json(
                200,
                {
                    "ok": True,
                    "source": existing,
                    "created": False,
                    "scrape": report,
                },
            )
            return

        # Avoid colliding with built-in ids.
        base_ids = {s.get("id") for s in read_json_list(ROOT / "data" / "sources.json")}
        if source_id in base_ids or any(s.get("id") == source_id for s in custom):
            source_id = f"{source_id}-{len(custom) + 1}"

        source = {
            "id": source_id,
            "name": name,
            "url": url,
            "focus": str(body.get("focus") or "Saved link"),
            "blurb": str(body.get("blurb") or url),
            "searchUrl": f"{url.rstrip('/')}/?s={{query}}",
            "custom": True,
        }
        if "airtable.com" in url:
            source["airtableUrl"] = url

        custom.append(source)
        write_json(CUSTOM_SOURCES_PATH, custom)

        report = None
        if body.get("scrape", True):
            report = self._scrape_locked([source_id])

        self._json(
            201,
            {
                "ok": True,
                "source": source,
                "created": True,
                "scrape": report,
            },
        )

    def _run_scrape(self, body: dict):
        source_id = str(body.get("sourceId") or "").strip()
        url = str(body.get("url") or "").strip()
        name = str(body.get("name") or "").strip()
        ids = [source_id] if source_id else None
        if body.get("sourceIds"):
            ids = list(body["sourceIds"])

        extras = None
        if url and source_id:
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            extras = [
                {
                    "id": source_id,
                    "name": name or name_from_url(url),
                    "url": url,
                    "focus": "Saved link",
                    "blurb": url,
                    "custom": True,
                    **({"airtableUrl": url} if "airtable.com" in url else {}),
                }
            ]

        report = self._scrape_locked(ids, extras)
        self._json(200, {"ok": True, "report": report, "scrape": {"pending": False, "message": "Local scrape finished."}})

    def _scrape_locked(self, source_ids: list[str] | None, extras: list | None = None):
        with SCRAPE_LOCK:
            scrape = load_scrape_module()
            return scrape.run(source_ids, extras, write_files=True)

    def _notion(self, path: str, body: dict):
        token = (body.get("token") or "").strip()
        database_id = (body.get("databaseId") or "").strip().replace("-", "")
        if not token or not database_id:
            self._json(400, {"error": "Missing Notion token or database ID"})
            return

        status, schema = notion_request(token, "GET", f"/databases/{database_id}")
        if status >= 400:
            message = schema.get("message") or schema.get("error") or "Could not open Notion database"
            self._json(
                status,
                {
                    "error": message,
                    "hint": "Share the database with your Notion integration, then try again.",
                    "details": schema,
                },
            )
            return

        if path == "/api/test-notion":
            self._json(
                200,
                {
                    "ok": True,
                    "database": schema.get("title"),
                    "properties": list((schema.get("properties") or {}).keys()),
                },
            )
            return

        payload = {
            "parent": {"database_id": database_id},
            "properties": build_notion_properties(schema, body),
        }
        summary = body.get("summary")
        if summary:
            payload["children"] = [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {"content": str(summary)[:1900]},
                            }
                        ]
                    },
                }
            ]

        status, data = notion_request(token, "POST", "/pages", payload)
        if status >= 400:
            self._json(
                status,
                {
                    "error": data.get("message") or data.get("error") or "Notion save failed",
                    "details": data,
                },
            )
            return
        self._json(200, {"ok": True, "id": data.get("id")})

    def _json(self, status: int, payload: dict):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args):
        print(f"[hub] {self.address_string()} - {fmt % args}")


def main():
    mimetypes.add_type("audio/mp4", ".m4a")
    mimetypes.add_type("image/x-icon", ".ico")
    if not CUSTOM_SOURCES_PATH.exists():
        write_json(CUSTOM_SOURCES_PATH, [])
    server = ThreadingHTTPServer(("127.0.0.1", PORT), HubHandler)
    print(f"Research Hub -> http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
