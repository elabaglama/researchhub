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
CUSTOM_SOURCES_PATH = ROOT / "data" / "custom-sources.json"
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
    """Pull company rows from the public Still Hiring Airtable shared view."""
    import http.cookiejar

    board_url = (
        source.get("airtableUrl")
        or "https://airtable.com/shrI8dno1rMGKZM8y/tblKU0jQiyIX182uU"
    )
    browser_ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    html = opener.open(
        urllib.request.Request(
            board_url,
            headers={
                "User-Agent": browser_ua,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
        ),
        timeout=45,
    ).read().decode("utf-8", "ignore")

    start = html.find("window.initData = ")
    if start < 0:
        raise RuntimeError("Airtable initData missing")
    start = html.find("{", start)
    depth = 0
    end = None
    for i, ch in enumerate(html[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise RuntimeError("Airtable initData incomplete")
    init = json.loads(html[start:end])
    csrf = init.get("csrfToken") or ""

    view_id = re.search(r'"sharedViewId":"(viw[a-zA-Z0-9]+)"', html)
    app_id = re.search(r'"applicationId":"(app[a-zA-Z0-9]+)"', html)
    access = re.search(r"accessPolicy=([a-zA-Z0-9%*\-.,]+)", html)
    if not (view_id and app_id and access and csrf):
        raise RuntimeError("Airtable share metadata incomplete")

    endpoint = (
        f"https://airtable.com/v0.3/view/{view_id.group(1)}/readSharedViewData"
        f"?stringifiedObjectParams=%7B%22shouldUseNestedResponseFormat%22%3Atrue%7D"
        f"&x-time-zone=Europe%2FIstanbul&x-user-locale=en"
        f"&accessPolicy={access.group(1)}"
    )
    raw = opener.open(
        urllib.request.Request(
            endpoint,
            headers={
                "User-Agent": browser_ua,
                "Accept": "application/json",
                "Referer": board_url,
                "x-airtable-application-id": app_id.group(1),
                "x-csrf-token": csrf,
                "x-requested-with": "XMLHttpRequest",
            },
        ),
        timeout=90,
    ).read().decode("utf-8", "ignore")
    payload = json.loads(raw)
    table = ((payload.get("data") or {}).get("table")) or {}
    cols = {c["id"]: c.get("name") or c["id"] for c in table.get("columns") or []}
    rows = table.get("rows") or []

    items: list[dict] = []
    for row in rows:
        cells = row.get("cellValuesByColumnId") or {}
        mapped = {cols.get(cid, cid): value for cid, value in cells.items()}
        company = clean_text(str(mapped.get("Company Name") or ""))
        if len(company) < 2:
            continue

        jobs = mapped.get("Jobs Page") or {}
        jobs_url = ""
        if isinstance(jobs, dict):
            jobs_url = str(jobs.get("url") or "").strip()
        elif isinstance(jobs, str):
            jobs_url = jobs.strip()
        href = jobs_url or board_url

        tagline = clean_text(str(mapped.get("Tagline") or ""))
        city = clean_text(str(mapped.get("HQ City") or ""))
        country = clean_text(str(mapped.get("HQ Country") or ""))
        place = ", ".join(p for p in (city, country) if p)
        employees = mapped.get("Employees")
        bits = [tagline]
        if place:
            bits.append(place)
        if employees not in (None, ""):
            bits.append(f"{employees} employees")
        summary = " · ".join(b for b in bits if b)[:280] or f"{company} is hiring on Still Hiring Today."

        items.append(
            {
                "id": make_id(source["id"], company, href),
                "title": f"{company} — hiring",
                "sourceId": source["id"],
                "url": href,
                "type": "jobs",
                "deadline": "Ongoing",
                "tags": ["jobs", "tech", "hiring"],
                "summary": summary,
            }
        )

    items.insert(
        0,
        {
            "id": make_id(source["id"], "Still Hiring Today board", board_url),
            "title": "Still Hiring Today — full Airtable board",
            "sourceId": source["id"],
            "url": board_url,
            "type": "jobs",
            "deadline": "Ongoing",
            "tags": ["jobs", "tech", "hiring", "board"],
            "summary": f"Live board with {len(items)} companies currently hiring.",
        },
    )

    return items


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


def origin_of(url: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def absolute_url(base: str, href: str) -> str:
    from urllib.parse import urljoin

    return urljoin(base, href)


def scrape_wordpress_api(source: dict, origin: str) -> list[dict]:
    items: list[dict] = []
    endpoints = [
        f"{origin}/wp-json/wp/v2/opportunities?per_page=50&page={{page}}&_fields=id,title,link,excerpt,content",
        f"{origin}/wp-json/wp/v2/posts?per_page=50&page={{page}}&_fields=id,title,link,excerpt,content",
    ]
    for template in endpoints:
        page = 1
        found_here = 0
        while page <= 4:
            try:
                raw = fetch(template.format(page=page), timeout=25)
                data = json.loads(raw)
            except Exception:
                break
            if not isinstance(data, list) or not data:
                break
            for entry in data:
                title_obj = entry.get("title") or {}
                title = clean_text(
                    title_obj.get("rendered") if isinstance(title_obj, dict) else str(title_obj)
                )
                href = entry.get("link") or source["url"]
                if len(title) < 6:
                    continue
                excerpt_obj = entry.get("excerpt") or {}
                excerpt = clean_text(
                    excerpt_obj.get("rendered") if isinstance(excerpt_obj, dict) else ""
                )
                content_obj = entry.get("content") or {}
                content = clean_text(
                    content_obj.get("rendered") if isinstance(content_obj, dict) else ""
                )
                blob = f"{title} {excerpt} {content}"
                items.append(
                    {
                        "id": make_id(source["id"], title, href),
                        "title": title[:180],
                        "sourceId": source["id"],
                        "url": href,
                        "type": guess_type(blob),
                        "deadline": extract_deadline(blob),
                        "tags": [guess_type(title), "custom"],
                        "summary": (excerpt or title)[:280],
                    }
                )
                found_here += 1
            if len(data) < 50:
                break
            page += 1
        if found_here:
            break
    return items


def scrape_rss(source: dict, origin: str) -> list[dict]:
    candidates = [
        f"{origin}/feed",
        f"{origin}/rss",
        f"{origin}/feed.xml",
        f"{origin}/atom.xml",
        f"{origin}/index.xml",
        f"{origin}/?feed=rss2",
        source.get("feedUrl") or "",
    ]
    items: list[dict] = []
    for feed_url in candidates:
        if not feed_url:
            continue
        try:
            xml = fetch(feed_url, timeout=20)
        except Exception:
            continue
        if "<rss" not in xml.lower() and "<feed" not in xml.lower():
            continue
        entries = re.findall(
            r"<item\b.*?</item>|<entry\b.*?</entry>",
            xml,
            flags=re.I | re.S,
        )
        for entry in entries[:80]:
            title_m = re.search(r"<title[^>]*>(.*?)</title>", entry, flags=re.I | re.S)
            link_m = re.search(r"<link[^>]*>(.*?)</link>", entry, flags=re.I | re.S)
            if not link_m:
                link_m = re.search(r'<link[^>]+href=["\']([^"\']+)["\']', entry, flags=re.I)
            desc_m = re.search(
                r"<description[^>]*>(.*?)</description>|<summary[^>]*>(.*?)</summary>|<content[^>]*>(.*?)</content>",
                entry,
                flags=re.I | re.S,
            )
            title = clean_text(title_m.group(1) if title_m else "")
            href = clean_text(link_m.group(1) if link_m else "")
            summary = clean_text(
                next((g for g in (desc_m.groups() if desc_m else ()) if g), "") if desc_m else ""
            )
            if len(title) < 6 or not href.startswith("http"):
                continue
            blob = f"{title} {summary}"
            items.append(
                {
                    "id": make_id(source["id"], title, href),
                    "title": title[:180],
                    "sourceId": source["id"],
                    "url": href,
                    "type": guess_type(blob),
                    "deadline": extract_deadline(blob),
                    "tags": [guess_type(title), "custom"],
                    "summary": (summary or title)[:280],
                }
            )
        if items:
            break
    return items


def scrape_html_listings(source: dict) -> list[dict]:
    html = fetch(source["url"], timeout=30)
    base = source["url"]
    items: list[dict] = []
    seen: set[str] = set()
    patterns = [
        r'<article[^>]*>.*?<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        r'<h[123][^>]*>\s*<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        r'<a[^>]+class=["\'][^"\']*(?:post|entry|card|title|opportunity)[^"\']*["\'][^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        r'<a[^>]+href=["\']([^"\']+)["\'][^>]*class=["\'][^"\']*(?:post|entry|card|title|opportunity)[^"\']*["\'][^>]*>(.*?)</a>',
    ]
    deny = (
        "/tag/",
        "/category/",
        "/author/",
        "/login",
        "/signup",
        "/cart",
        "#",
        "javascript:",
        "/wp-admin",
        "/privacy",
        "/terms",
    )
    for pattern in patterns:
        for href, label in re.findall(pattern, html, flags=re.I | re.S):
            title = clean_text(label)
            full = absolute_url(base, href)
            if len(title) < 8 or len(title) > 180:
                continue
            low = full.lower()
            if any(d in low for d in deny):
                continue
            if full in seen:
                continue
            # Prefer same-host links
            if origin_of(full) != origin_of(base) and "airtable.com" not in low:
                continue
            seen.add(full)
            items.append(
                {
                    "id": make_id(source["id"], title, full),
                    "title": title[:180],
                    "sourceId": source["id"],
                    "url": full,
                    "type": guess_type(title),
                    "deadline": extract_deadline(title),
                    "tags": [guess_type(title), "custom"],
                    "summary": title[:280],
                }
            )
        if len(items) >= 12:
            break
    return items[:80]


def _github_headers() -> dict:
    import os
    token = os.environ.get("GITHUB_TOKEN", "")
    h = {"User-Agent": UA, "Accept": "application/vnd.github.v3+json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _github_api(url: str) -> dict | list:
    req = urllib.request.Request(url, headers=_github_headers())
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _github_raw(raw_url: str) -> str:
    req = urllib.request.Request(raw_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
        return resp.read().decode("utf-8", "ignore")


def _parse_github_file(source: dict, path: str, content: str) -> list[dict]:
    """Extract opportunity entries from a single file's content."""
    items: list[dict] = []

    # ── JSON: look for array of {title, url, ...} objects ──────────────────
    if path.lower().endswith(".json"):
        try:
            data = json.loads(content)
            entries = data if isinstance(data, list) else (data.get("items") or data.get("opportunities") or [])
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                title = clean_text(str(entry.get("title") or entry.get("name") or ""))
                href = str(entry.get("url") or entry.get("link") or entry.get("href") or "").strip()
                if len(title) < 6 or not href.startswith("http"):
                    continue
                summary = clean_text(str(entry.get("summary") or entry.get("description") or ""))
                deadline = str(entry.get("deadline") or entry.get("deadline_date") or "Open")
                items.append({
                    "id": make_id(source["id"], title, href),
                    "title": title[:180],
                    "sourceId": source["id"],
                    "url": href,
                    "type": guess_type(title + " " + summary),
                    "deadline": deadline,
                    "tags": [guess_type(title), "github"],
                    "summary": (summary or title)[:280],
                })
        except Exception:
            pass
        return items

    # ── Markdown / text: extract [label](url) links ─────────────────────────
    link_re = re.compile(r"\[([^\]]{4,200})\]\((https?://[^)\s]{10,})\)")
    lines = content.split("\n")
    current_section = ""

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Track section headings for type hints
        if stripped.startswith("#"):
            current_section = re.sub(r"^#+\s*", "", stripped).strip()
            continue

        for m in link_re.finditer(stripped):
            title = clean_text(m.group(1))
            href = m.group(2).strip().rstrip(")")
            if not href.startswith("http") or len(title) < 6:
                continue
            # Skip GitHub meta-links (issues, pulls, commits, file browser)
            if "github.com" in href and any(
                seg in href for seg in ("/blob/", "/tree/", "/commit/", "/issues", "/pulls", "/actions")
            ):
                continue
            # Skip badge/shield image links
            if any(badge in href for badge in ("shields.io", "img.shields", "badge", "travis-ci", "coveralls")):
                continue

            context = stripped.replace(m.group(0), "").strip(" -·|:>")
            context = clean_text(context)
            next_line = clean_text(lines[i + 1]) if i + 1 < len(lines) else ""
            summary = (context or next_line or title)[:280]
            deadline = extract_deadline(stripped + " " + next_line)

            items.append({
                "id": make_id(source["id"], title, href),
                "title": title[:180],
                "sourceId": source["id"],
                "url": href,
                "type": guess_type(title + " " + current_section),
                "deadline": deadline,
                "tags": [guess_type(title), "github"],
                "summary": summary,
            })

    # De-duplicate by id within this file
    seen: set[str] = set()
    unique: list[dict] = []
    for item in items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique.append(item)
    return unique[:80]


def scrape_github_repo(source: dict) -> list[dict]:
    """Read README + markdown/JSON files from a public GitHub repo."""
    from urllib.parse import urlparse

    url = source["url"]
    parsed = urlparse(url)
    parts = parsed.path.strip("/").split("/")
    if len(parts) < 2:
        return []

    owner, repo = parts[0], parts[1]
    repo = repo.rstrip(".git")

    # ── Direct raw file ────────────────────────────────────────────────────
    if len(parts) >= 4 and parts[2] in ("blob", "raw"):
        branch, *rest = parts[3], parts[4:]
        file_path = "/".join(rest) if rest else ""
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
        try:
            content = _github_raw(raw_url)
            return _parse_github_file(source, file_path, content)
        except Exception:
            return []

    # ── Discover default branch ─────────────────────────────────────────────
    try:
        repo_info = _github_api(f"https://api.github.com/repos/{owner}/{repo}")
        branch = repo_info.get("default_branch", "main")
    except Exception:
        branch = "main"

    # ── Get repo file tree ──────────────────────────────────────────────────
    try:
        tree_data = _github_api(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        )
        all_files = [f["path"] for f in tree_data.get("tree", []) if f.get("type") == "blob"]
    except Exception:
        all_files = ["README.md"]

    # ── Rank files by relevance ─────────────────────────────────────────────
    priority_names = {
        "readme.md", "readme.rst", "readme.txt",
        "opportunities.md", "opportunities.json",
        "resources.md", "resources.json",
        "grants.md", "fellowships.md", "jobs.md",
        "programs.md", "calls.md", "awards.md",
    }

    def _rank(path: str) -> int:
        name = path.lower().split("/")[-1]
        depth = path.count("/")
        if name in priority_names:
            return depth
        ext = name.rsplit(".", 1)[-1] if "." in name else ""
        if ext in ("md", "rst"):
            return 10 + depth
        if ext == "json":
            return 20 + depth
        if ext in ("txt", "yaml", "yml"):
            return 30 + depth
        return 99

    relevant = [f for f in all_files if _rank(f) < 99 and f.count("/") <= 4]
    relevant.sort(key=_rank)
    relevant = relevant[:20]

    # ── Fetch and parse each file ───────────────────────────────────────────
    all_items: list[dict] = []
    seen_ids: set[str] = set()

    for file_path in relevant:
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
        try:
            content = _github_raw(raw_url)
            for item in _parse_github_file(source, file_path, content):
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    all_items.append(item)
        except Exception:
            continue

    # Always include a portal entry linking back to the repo itself
    portal_id = make_id(source["id"], f"{owner}/{repo}", url)
    if portal_id not in seen_ids:
        all_items.insert(0, {
            "id": portal_id,
            "title": f"{owner}/{repo} — GitHub repository",
            "sourceId": source["id"],
            "url": url,
            "type": "opportunity",
            "deadline": "Open",
            "tags": ["github", "portal"],
            "summary": f"Scraped from GitHub repository {owner}/{repo}. Contains {len(all_items)} linked opportunities.",
        })

    return all_items[:80]


def scrape_generic(source: dict) -> list[dict]:
    """Best-effort scraper for any library URL (GitHub → WP API → RSS → HTML)."""
    url = source["url"]

    if "github.com" in url:
        return scrape_github_repo(source)

    if "airtable.com" in url:
        # Reuse Airtable shared-view logic by pointing airtableUrl at this URL.
        return scrape_still_hiring({**source, "airtableUrl": url})

    origin = origin_of(url)
    for scraper in (
        lambda: scrape_wordpress_api(source, origin),
        lambda: scrape_rss(source, origin),
        lambda: scrape_html_listings(source),
    ):
        try:
            items = scraper()
        except Exception:
            items = []
        if items:
            return items

    # Always keep at least a portal entry so the source is searchable/linked.
    return [
        {
            "id": make_id(source["id"], source.get("name") or origin, url),
            "title": f"{source.get('name') or origin} — browse source",
            "sourceId": source["id"],
            "url": url,
            "type": "opportunity",
            "deadline": "Open",
            "tags": ["custom", "portal"],
            "summary": f"No structured listings detected yet. Open the original site: {url}",
        }
    ]


SCRAPERS = {
    "opportunities-for-youth": scrape_opportunities_for_youth,
    "still-hiring": scrape_still_hiring,
    "artinfoland": scrape_artinfoland,
}


def load_sources() -> list[dict]:
    base = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    custom: list[dict] = []
    if CUSTOM_SOURCES_PATH.exists():
        try:
            raw = json.loads(CUSTOM_SOURCES_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                custom = raw
        except Exception:
            custom = []
    seen = {s["id"] for s in base}
    merged = list(base)
    for source in custom:
        sid = source.get("id")
        if not sid or sid in seen:
            continue
        merged.append(source)
        seen.add(sid)
    return merged


def save_custom_sources(sources: list[dict]) -> None:
    CUSTOM_SOURCES_PATH.write_text(
        json.dumps(sources, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def load_custom_sources() -> list[dict]:
    if not CUSTOM_SOURCES_PATH.exists():
        return []
    try:
        raw = json.loads(CUSTOM_SOURCES_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


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


def run(source_ids: list[str] | None = None) -> dict:
    all_sources = load_sources()
    if source_ids:
        wanted = set(source_ids)
        sources = [s for s in all_sources if s["id"] in wanted]
    else:
        sources = all_sources

    existing: list[dict] = []
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []

    report: dict[str, object] = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {},
        "mode": "partial" if source_ids else "full",
    }

    # Preserve prior meta for sources not scraped this run.
    if META_PATH.exists() and source_ids:
        try:
            prev = json.loads(META_PATH.read_text(encoding="utf-8"))
            report["sources"] = dict(prev.get("sources") or {})
        except Exception:
            pass

    fresh_by_source: dict[str, list[dict]] = {}
    for source in sources:
        source_id = source["id"]
        scraper = SCRAPERS.get(source_id, scrape_generic)
        try:
            items = scraper(source)
            fresh_by_source[source_id] = items
            report["sources"][source_id] = {
                "ok": True,
                "count": len(items),
                "mode": "dedicated" if source_id in SCRAPERS else "generic",
            }
            print(f"[ok] {source_id}: {len(items)}")
        except Exception as exc:  # noqa: BLE001
            report["sources"][source_id] = {"ok": False, "error": str(exc), "count": 0}
            print(f"[fail] {source_id}: {exc}")

    succeeded = set(fresh_by_source.keys())
    valid_ids = {s["id"] for s in all_sources}

    if source_ids:
        # Partial: replace only sources that succeeded; keep others (including unrelated).
        kept = [item for item in existing if item.get("sourceId") not in succeeded]
    else:
        # Full: keep only failed sources' old rows; drop removed/orphan sources.
        attempted = {s["id"] for s in sources}
        failed = attempted - succeeded
        kept = [
            item
            for item in existing
            if item.get("sourceId") in failed and item.get("sourceId") in valid_ids
        ]

    all_items = kept + [item for rows in fresh_by_source.values() for item in rows]
    # Safety: never keep rows for sources that are no longer in the library.
    all_items = [item for item in all_items if item.get("sourceId") in valid_ids]

    merged = merge_unique(all_items)
    OUT_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report["total"] = len(merged)
    META_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Stored {len(merged)} opportunities -> {OUT_PATH}")
    return report


if __name__ == "__main__":
    import sys

    ids = [arg for arg in sys.argv[1:] if arg and not arg.startswith("-")]
    run(ids or None)
