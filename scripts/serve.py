#!/usr/bin/env python3
"""Local static server with a Notion save proxy (avoids browser CORS)."""

from __future__ import annotations

import json
import mimetypes
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 5173
NOTION_VERSION = "2022-06-28"


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
    if deadline_name:
        dtype = props_meta[deadline_name].get("type")
        value = str(body.get("deadline") or "Open")[:200]
        if dtype == "rich_text":
            out[deadline_name] = {"rich_text": [{"text": {"content": value}}]}
        elif dtype == "date":
            out[deadline_name] = {"date": None}

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
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        if self.path.rstrip("/") in {"/api/save-to-notion", "/api/test-notion"}:
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def do_POST(self):
        path = self.path.rstrip("/")
        if path not in {"/api/save-to-notion", "/api/test-notion"}:
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

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
    server = ThreadingHTTPServer(("127.0.0.1", PORT), HubHandler)
    print(f"Research Hub -> http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
