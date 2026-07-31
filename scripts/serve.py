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
        if self.path.startswith("/api/save-to-notion"):
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def do_POST(self):
        if self.path.rstrip("/") != "/api/save-to-notion":
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
        database_id = (body.get("databaseId") or "").strip()
        if not token or not database_id:
            self._json(400, {"error": "Missing Notion token or database ID"})
            return

        payload = {
            "parent": {"database_id": database_id},
            "properties": {
                "Name": {
                    "title": [
                        {
                            "text": {
                                "content": str(body.get("title") or "Untitled")[:2000]
                            }
                        }
                    ]
                },
                "URL": {"url": body.get("url") or None},
                "Deadline": {
                    "rich_text": [
                        {
                            "text": {
                                "content": str(body.get("deadline") or "Open")[:200]
                            }
                        }
                    ]
                },
                "Source": {
                    "rich_text": [
                        {"text": {"content": str(body.get("source") or "")[:200]}}
                    ]
                },
                "Type": {
                    "rich_text": [
                        {
                            "text": {
                                "content": str(body.get("type") or "opportunity")[:100]
                            }
                        }
                    ]
                },
            },
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

        req = urllib.request.Request(
            "https://api.notion.com/v1/pages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._json(200, {"ok": True, "id": data.get("id")})
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(detail)
            except json.JSONDecodeError:
                parsed = {"error": detail or err.reason}
            self._json(err.code, parsed)
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)})

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
    print(f"Research Hub → http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
