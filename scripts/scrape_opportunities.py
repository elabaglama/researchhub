#!/usr/bin/env python3
"""Scrape opportunity listings from configured sources and store them as JSON."""

from __future__ import annotations

import hashlib
import json
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "data" / "sources.json"
OUT_PATH = ROOT / "data" / "opportunities.json"
META_PATH = ROOT / "data" / "scrape-meta.json"

UA = "Mozilla/5.0 (compatible; ResearchHubBot/1.0; +https://github.com/elabaglama/researchhub)"
SSL_CTX = ssl._create_unverified_context()


def fetch(url: str, timeout: int = 35) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "text/html,application/json,application/xhtml+xml"},
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
        return resp.read().decode("utf-8", "ignore")


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def make_id(source_id: str, title: str, url: str) -> str:
    raw = f"{source_id}|{title}|{url}".encode("utf-8")
    return f"{source_id}-{hashlib.sha1(raw).hexdigest()[:12]}"


def guess_type(title: str) -> str:
    t = title.lower()
    mapping = [
        ("fellowship", "fellowship"),
        ("scholarship", "scholarship"),
        ("residency", "residency"),
        ("internship", "internship"),
        ("grant", "grant"),
        ("job", "jobs"),
        ("hiring", "jobs"),
        ("career", "jobs"),
        ("competition", "competition"),
        ("challenge", "competition"),
        ("call for", "call"),
        ("open call", "open-call"),
        ("program", "program"),
    ]
    for needle, label in mapping:
        if needle in t:
            return label
    return "opportunity"


def extract_deadline(text: str) -> str:
    """Pull the last application / deadline date from free text."""
    text = clean_text(text)
    patterns = [
        r"Application Deadline[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Applications? (?:close|due|deadline)[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Apply by[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Deadline[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Closing date[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Last (?:application|apply) date[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"Due date[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})",
        r"(?:Application Deadline|Deadline|Apply by|Closing date)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"(?:Application Deadline|Deadline|Apply by|Closing date)[:\s]+(\d{4}[/-]\d{1,2}[/-]\d{1,2})",
        r"(?:Application Deadline|Deadline|Apply by)[:\s]+(\d{1,2} [A-Za-z]+ \d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1).replace(",", "").strip()
    if re.search(r"\bon[\s-]?going\b", text, re.I):
        return "Ongoing"
    return "Open"


def enrich_ofy_deadline(item: dict) -> dict:
    """Fetch detail page for Opportunities for Youth to get real deadline."""
    try:
        html = fetch(item["url"], timeout=25)
        # Slice around the post body to avoid sidebar widgets.
        start = re.search(r'class="[^"]*post-content[^"]*"', html, flags=re.I)
        search_html = html[start.start() : start.start() + 12000] if start else html
        deadline = extract_deadline(search_html)
        if deadline and deadline != "Open":
            item["deadline"] = deadline
        # Also try explicit date phrases near "before the deadline" context
        if item.get("deadline") in (None, "Open"):
            soft = re.search(
                r"(?:before the deadline|deadline is|deadline of)\s*([A-Za-z]+ \d{1,2},?\s*\d{4}|\d{1,2} [A-Za-z]+ \d{4})",
                search_html,
                flags=re.I,
            )
            if soft:
                item["deadline"] = soft.group(1).replace(",", "").strip()
        meta = re.search(
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            flags=re.I,
        )
        if not meta:
            meta = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
                html,
                flags=re.I,
            )
        if meta:
            summary = clean_text(meta.group(1))
            if len(summary) > 40:
                item["summary"] = summary[:280]
    except Exception:
        pass
    return item


def scrape_opportunities_for_youth(source: dict) -> list[dict]:
    html = fetch(source["url"].replace("http://", "https://"))
    items: list[dict] = []
    seen: set[str] = set()

    patterns = [
        r'<h[23][^>]*>\s*<a[^>]+href="(https?://opportunitiesforyouth\.org/[^"]+)"[^>]*>(.*?)</a>',
        r'<a[^>]+href="(https?://opportunitiesforyouth\.org/\d{4}/\d{2}/[^"]+)"[^>]*rel="bookmark"[^>]*>(.*?)</a>',
        r'<a[^>]+href="(https?://opportunitiesforyouth\.org/\d{4}/\d{2}/[^"]+)"[^>]*>(.*?)</a>',
    ]

    for pattern in patterns:
        for href, title_html in re.findall(pattern, html, flags=re.I | re.S):
            title = clean_text(title_html)
            if len(title) < 12 or href in seen:
                continue
            if any(x in href for x in ("/category/", "/tag/", "/author/", "/page/")):
                continue
            seen.add(href)
            items.append(
                {
                    "id": make_id(source["id"], title, href),
                    "title": title[:180],
                    "sourceId": source["id"],
                    "url": href,
                    "type": guess_type(title),
                    "deadline": extract_deadline(title),
                    "tags": [guess_type(title), "youth"],
                    "summary": title,
                }
            )
        if items:
            break

    # Enrich deadlines from detail pages (parallel, capped)
    enriched: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(enrich_ofy_deadline, item) for item in items[:80]]
        for fut in as_completed(futures):
            enriched.append(fut.result())
    # Keep stable order by original list
    by_id = {item["id"]: item for item in enriched}
    return [by_id[item["id"]] for item in items[:80] if item["id"] in by_id]


def scrape_still_hiring(source: dict) -> list[dict]:
    """Still Hiring Today is an Airtable embed; keep a board entry plus any parseable links."""
    html = fetch(source["url"])
    items: list[dict] = []
    seen: set[str] = set()

    airtable = re.search(
        r"https://airtable\.com/(?:embed/)?(shr[A-Za-z0-9]+)(?:/tbl[A-Za-z0-9]+)?",
        html,
    )
    board_url = (
        f"https://airtable.com/{airtable.group(1)}"
        if airtable
        else "https://airtable.com/shrI8dno1rMGKZM8y/tblKU0jQiyIX182uU"
    )

    items.append(
        {
            "id": make_id(source["id"], "Still Hiring Today board", board_url),
            "title": "Still Hiring Today — live tech hiring board",
            "sourceId": source["id"],
            "url": board_url,
            "type": "jobs",
            "deadline": "Ongoing",
            "tags": ["jobs", "tech", "hiring", "board"],
            "summary": "Community-sourced Airtable board of tech companies that are still hiring.",
        }
    )
    items.append(
        {
            "id": make_id(source["id"], "Still Hiring Today", source["url"]),
            "title": "Still Hiring Today portal",
            "sourceId": source["id"],
            "url": source["url"],
            "type": "jobs",
            "deadline": "Ongoing",
            "tags": ["jobs", "tech", "hiring"],
            "summary": "Browse and filter companies with open tech roles on Still Hiring Today.",
        }
    )

    for href, label in re.findall(r'href="(https?://[^"]+)"[^>]*>(.*?)</a>', html, flags=re.I | re.S):
        title = clean_text(label)
        if len(title) < 3 or len(title) > 60:
            continue
        low = title.lower()
        if any(
            x in low
            for x in ("privacy", "terms", "cookie", "login", "sign", "airtable", "full screen", "how it")
        ):
            continue
        if "stillhiring" in href or "airtable.com" in href or "super.so" in href:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "id": make_id(source["id"], title, href),
                "title": f"{title} — hiring",
                "sourceId": source["id"],
                "url": href,
                "type": "jobs",
                "deadline": "Ongoing",
                "tags": ["jobs", "tech", "hiring"],
                "summary": f"{title} appears on Still Hiring Today.",
            }
        )

    return items[:40]


def scrape_artinfoland(source: dict) -> list[dict]:
    """WordPress REST API with full content for real application deadlines."""
    items: list[dict] = []
    page = 1
    while page <= 5:
        api = (
            "https://artinfoland.com/wp-json/wp/v2/opportunities"
            f"?per_page=50&page={page}&_fields=id,title,link,content,excerpt"
        )
        try:
            raw = fetch(api)
            data = json.loads(raw)
        except Exception:
            break
        if not isinstance(data, list) or not data:
            break
        for entry in data:
            title_obj = entry.get("title") or {}
            title = clean_text(title_obj.get("rendered") if isinstance(title_obj, dict) else str(title_obj))
            href = entry.get("link") or source["url"]
            if len(title) < 6:
                continue
            excerpt_obj = entry.get("excerpt") or {}
            excerpt = clean_text(excerpt_obj.get("rendered") if isinstance(excerpt_obj, dict) else "")
            content_obj = entry.get("content") or {}
            content = clean_text(content_obj.get("rendered") if isinstance(content_obj, dict) else "")
            blob = f"{title} {excerpt} {content}"
            items.append(
                {
                    "id": make_id(source["id"], title, href),
                    "title": title[:180],
                    "sourceId": source["id"],
                    "url": href,
                    "type": guess_type(blob),
                    "deadline": extract_deadline(blob),
                    "tags": [guess_type(title), "arts"],
                    "summary": (excerpt or title)[:280],
                }
            )
        if len(data) < 50:
            break
        page += 1

    return items[:200]


SCRAPERS = {
    "opportunities-for-youth": scrape_opportunities_for_youth,
    "still-hiring": scrape_still_hiring,
    "artinfoland": scrape_artinfoland,
}


def load_sources() -> list[dict]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def merge_unique(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        key = item["id"]
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def run() -> dict:
    sources = load_sources()
    all_items: list[dict] = []
    report: dict[str, object] = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {},
    }

    for source in sources:
        source_id = source["id"]
        scraper = SCRAPERS.get(source_id)
        if not scraper:
            report["sources"][source_id] = {"ok": False, "error": "no scraper", "count": 0}
            continue
        try:
            items = scraper(source)
            all_items.extend(items)
            report["sources"][source_id] = {"ok": True, "count": len(items)}
            print(f"[ok] {source_id}: {len(items)}")
        except Exception as exc:  # noqa: BLE001
            report["sources"][source_id] = {"ok": False, "error": str(exc), "count": 0}
            print(f"[fail] {source_id}: {exc}")

    merged = merge_unique(all_items)
    OUT_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report["total"] = len(merged)
    META_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Stored {len(merged)} opportunities -> {OUT_PATH}")
    return report


if __name__ == "__main__":
    run()
