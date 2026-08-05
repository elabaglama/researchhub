#!/usr/bin/env python3
"""Add/remove custom library sources (used by GitHub Actions + local tooling)."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CUSTOM_PATH = ROOT / "data" / "custom-sources.json"
SOURCES_PATH = ROOT / "data" / "sources.json"
OPP_PATH = ROOT / "data" / "opportunities.json"


def read_list(path: Path) -> list:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


def write_list(path: Path, rows: list) -> None:
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:48]


def name_from_url(url: str) -> str:
    host = urlparse(url).hostname or url
    return host.replace("www.", "")


def add_source(url: str, name: str = "") -> dict:
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    custom = read_list(CUSTOM_PATH)
    for existing in custom:
        if existing.get("url") == url:
            return {"created": False, "source": existing}

    display = name.strip() or name_from_url(url)
    source_id = f"custom-{slugify(display) or 'source'}"
    base_ids = {s.get("id") for s in read_list(SOURCES_PATH)}
    used = base_ids | {s.get("id") for s in custom}
    if source_id in used:
        source_id = f"{source_id}-{len(custom) + 1}"

    source = {
        "id": source_id,
        "name": display,
        "url": url,
        "focus": "Saved link",
        "blurb": url,
        "searchUrl": f"{url.rstrip('/')}/?s={{query}}",
        "custom": True,
    }
    if "airtable.com" in url:
        source["airtableUrl"] = url

    custom.append(source)
    write_list(CUSTOM_PATH, custom)
    return {"created": True, "source": source}


def remove_source(source_id: str) -> dict:
    custom = read_list(CUSTOM_PATH)
    next_rows = [s for s in custom if s.get("id") != source_id]
    write_list(CUSTOM_PATH, next_rows)
    opps = read_list(OPP_PATH)
    write_list(OPP_PATH, [o for o in opps if o.get("sourceId") != source_id])
    return {"removed": source_id, "remaining": len(next_rows)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="", help="Add this source URL")
    parser.add_argument("--name", default="", help="Optional display name")
    parser.add_argument("--remove", default="", help="Remove custom source id")
    args = parser.parse_args()

    result = {}
    if args.remove:
        result["remove"] = remove_source(args.remove.strip())
    if args.url.strip():
        result["add"] = add_source(args.url.strip(), args.name)
    print(json.dumps(result or {"ok": True}))


if __name__ == "__main__":
    main()
