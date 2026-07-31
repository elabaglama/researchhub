import json
import re
from pathlib import Path

html = Path("data/_airtable_sample.html").read_text(encoding="utf-8", errors="ignore")
m = re.search(r"window\.initData\s*=\s*(\{.*?\});\s*(?:</script>|window\.)", html, flags=re.S)
if not m:
    m = re.search(r"window\.initData\s*=\s*(\{.*)", html, flags=re.S)
print("match", bool(m), "span", (m.end()-m.start()) if m else None)
raw = m.group(1)
# trim to balanced JSON roughly by finding last };
# try progressive parse
for end in range(len(raw), max(0, len(raw) - 50000), -1):
    chunk = raw[:end]
    if not chunk.endswith("}"):
        continue
    try:
        data = json.loads(chunk)
        print("parsed keys", list(data.keys())[:20])
        Path("data/_airtable_init.json").write_text(json.dumps(data)[:200000], encoding="utf-8")
        break
    except Exception:
        continue
else:
    print("could not parse; dump head")
    Path("data/_airtable_init_raw.txt").write_text(raw[:5000], encoding="utf-8")
