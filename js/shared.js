const SOURCES_KEY = "research-hub-sources";
const NOTION_KEY = "research-hub-notion";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sourceById(sources, id) {
  return sources.find((source) => source.id === id);
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = normalize(
    [
      item.title,
      item.summary,
      item.type,
      item.deadline,
      ...(item.tags || []),
    ].join(" ")
  );
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(normalize(token)));
}

const CATEGORY_DEFS = [
  { key: "jobs",     label: "Jobs",              types: ["jobs", "internship"] },
  { key: "awards",   label: "Awards",             types: ["grant", "competition", "open-call"] },
  { key: "programs", label: "Programs",           types: ["scholarship", "fellowship", "program", "residency"] },
  { key: "calls",    label: "Partnership Calls",  types: ["call"] },
  { key: "events",   label: "Events & Classes",   types: [] },
  { key: "other",    label: "Opportunities",      types: ["opportunity"] },
];

const _typeToCategory = new Map();
for (const cat of CATEGORY_DEFS) {
  for (const t of cat.types) _typeToCategory.set(t, cat.key);
}

const _EVENT_KEYWORDS = ["conference", "workshop", "webinar", "summit", "seminar", "training", "bootcamp", "course", "event", "class"];

function classifyItem(item) {
  const mapped = _typeToCategory.get(item.type);
  if (mapped) return mapped;
  const text = normalize((item.title || "") + " " + (item.summary || ""));
  if (_EVENT_KEYWORDS.some((kw) => text.includes(kw))) return "events";
  return "other";
}

const CONTINENT_KEYWORDS = {
  africa: ["africa", "african", "nigeria", "nigerian", "kenya", "kenyan", "ghana", "ghanaian", "ethiopia", "ethiopian", "south africa", "egypt", "egyptian", "morocco", "moroccan", "algeria", "algeria", "tunisia", "tunisian", "tanzania", "uganda", "ugandan", "zimbabwe", "senegal", "cameroon", "ivory coast", "cote d'ivoire", "rwanda", "zambia", "botswana", "mozambique", "mali", "mali", "burkina faso", "niger", "chad", "angola", "namibia", "madagascar", "malawi", "sierra leone", "liberia", "guinea", "benin", "togo", "gambia", "djibouti", "eritrea", "somalia", "south sudan", "sudan", "congo", "gabon", "mauritius", "seychelles", "sub-saharan", "sahel"],
  asia: ["asia", "asian", "china", "chinese", "japan", "japanese", "india", "indian", "south korea", "korea", "korean", "indonesia", "indonesian", "thailand", "thai", "vietnam", "vietnamese", "philippines", "filipino", "malaysia", "malaysian", "singapore", "bangladesh", "bangladeshi", "pakistan", "pakistani", "sri lanka", "myanmar", "cambodia", "cambodian", "laos", "mongolia", "mongolian", "nepal", "nepali", "bhutan", "maldives", "timor-leste", "taiwan", "hong kong", "kazakhstan", "uzbekistan", "kyrgyzstan", "tajikistan", "turkmenistan"],
  europe: ["europe", "european", "germany", "german", "france", "french", "uk", "united kingdom", "britain", "british", "england", "netherlands", "dutch", "sweden", "swedish", "norway", "norwegian", "denmark", "danish", "finland", "finnish", "switzerland", "swiss", "austria", "austrian", "belgium", "belgian", "italy", "italian", "spain", "spanish", "portugal", "portuguese", "poland", "polish", "czech", "hungary", "hungarian", "romania", "romanian", "bulgaria", "croatia", "estonia", "latvia", "lithuania", "slovakia", "slovenia", "luxembourg", "ireland", "irish", "greece", "greek", "serbia", "ukraine", "ukrainian", "russia", "russian", "eu ", "european union", "schengen", "scandinavia", "nordic"],
  americas: ["americas", "usa", "united states", "america", "american", "canada", "canadian", "mexico", "mexican", "brazil", "brazilian", "argentina", "argentinian", "chile", "chilean", "colombia", "colombian", "peru", "peruvian", "venezuela", "ecuador", "bolivia", "paraguay", "uruguay", "cuba", "haiti", "haitian", "dominican republic", "jamaica", "trinidad", "guyana", "suriname", "central america", "caribbean", "latin america", "north america", "south america"],
  "middle-east": ["middle east", "mena", "turkey", "turkish", "iran", "iranian", "iraq", "iraqi", "saudi arabia", "saudi", "uae", "united arab emirates", "emirati", "jordan", "jordanian", "lebanon", "lebanese", "israel", "israeli", "palestine", "palestinian", "oman", "omani", "qatar", "qatari", "kuwait", "kuwaiti", "bahrain", "bahraini", "yemen", "yemeni", "syria", "syrian", "gulf", "gcc"],
  oceania: ["australia", "australian", "new zealand", "pacific", "oceania", "fiji", "fijian", "papua new guinea", "solomon islands", "vanuatu", "samoa", "tonga", "micronesia", "polynesia"],
};

function matchesFilters(item, { type = "", continent = "", country = "", age = "" } = {}) {
  if (type && classifyItem(item) !== type) return false;

  if (continent || country) {
    const text = normalize(
      (item.title || "") + " " + (item.summary || "") + " " + (item.tags || []).join(" ")
    );
    if (continent) {
      const keywords = CONTINENT_KEYWORDS[continent] || [];
      if (!keywords.some((kw) => text.includes(normalize(kw)))) return false;
    }
    if (country) {
      if (!text.includes(normalize(country))) return false;
    }
  }

  if (age) {
    const text = normalize((item.title || "") + " " + (item.summary || ""));
    if (age === "youth") {
      const kws = ["youth", "student", "undergraduate", "young professional", "under 25", "under 30", "18-25", "18-30", "early stage"];
      if (!kws.some((kw) => text.includes(normalize(kw)))) return false;
    } else if (age === "early-career") {
      const kws = ["early career", "early-career", "young professional", "under 35", "under 40", "junior researcher", "junior professional"];
      if (!kws.some((kw) => text.includes(normalize(kw)))) return false;
    }
  }

  return true;
}

function loadCustomSources() {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomSources(sources) {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
}

async function loadBaseSources() {
  try {
    const res = await fetch("data/sources.json", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadFileCustomSources() {
  try {
    const res = await fetch("data/custom-sources.json", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadAllSources() {
  const [base, fileCustom] = await Promise.all([
    fetch("data/sources.json", { cache: "no-store" }).then((r) => r.json()),
    loadFileCustomSources(),
  ]);
  const browserCustom = loadCustomSources();
  const seen = new Set(base.map((s) => s.id));
  const merged = [...base];

  for (const source of [...fileCustom, ...browserCustom]) {
    if (!source?.id || seen.has(source.id)) continue;
    merged.push(source);
    seen.add(source.id);
  }
  return merged;
}

async function addLibrarySource(url, { scrape = true } = {}) {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, scrape }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not add source");
  }

  // Keep a browser mirror for offline display, synced to server file.
  const fileCustom = await loadFileCustomSources();
  saveCustomSources(fileCustom);
  return data;
}

async function removeLibrarySource(sourceId) {
  const response = await fetch(`/api/sources?id=${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not remove source");
  }
  const fileCustom = await loadFileCustomSources();
  saveCustomSources(fileCustom);
  return data;
}

async function triggerScrape({ sourceId } = {}) {
  const response = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sourceId ? { sourceId } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Scrape failed");
  }
  return data;
}

async function migrateBrowserSourcesToServer() {
  const browser = loadCustomSources();
  if (!browser.length) return { migrated: 0 };
  const fileCustom = await loadFileCustomSources();
  const known = new Set(fileCustom.map((s) => s.url));
  let migrated = 0;
  for (const source of browser) {
    if (!source?.url || known.has(source.url)) continue;
    try {
      await addLibrarySource(source.url, { scrape: true });
      known.add(source.url);
      migrated += 1;
    } catch {
      /* keep going */
    }
  }
  return { migrated };
}

function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function getNotionConfig() {
  try {
    const raw = localStorage.getItem(NOTION_KEY);
    if (!raw) return { token: "", databaseId: "" };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || "",
      databaseId: parsed.databaseId || "",
    };
  } catch {
    return { token: "", databaseId: "" };
  }
}

function saveNotionConfig(config) {
  localStorage.setItem(
    NOTION_KEY,
    JSON.stringify({
      token: (config.token || "").trim(),
      databaseId: (config.databaseId || "").trim(),
    })
  );
}

function clearNotionConfig() {
  localStorage.removeItem(NOTION_KEY);
}

function isNotionConnected() {
  const config = getNotionConfig();
  return Boolean(config.token && config.databaseId);
}

async function saveOpportunityToNotion(item, sourceName = "") {
  const latest = getNotionConfig();
  if (!latest.token || !latest.databaseId) {
    throw new Error(
      "Connect Notion once in Library (Connect Notion), then Save works with one click."
    );
  }

  const payload = {
    title: item.title,
    url: item.url,
    deadline: item.deadline || "Open",
    summary: item.summary || "",
    source: sourceName || item.sourceId || "",
    type: item.type || "opportunity",
  };

  const response = await fetch("/api/save-to-notion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...latest }),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      text ||
      "Notion save failed";
    throw new Error(String(message));
  }

  return data || { ok: true };
}

function renderResultCards(container, items, sources, { carded = false } = {}) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-note">No matches found.</p>`;
    return;
  }

  const itemClass = carded ? "result-card" : "simple-item";

  container.innerHTML = items
    .map((item, index) => {
      const source = sourceById(sources, item.sourceId);
      const sourceName = source?.name || "";
      const deadline = item.deadline
        ? `<span class="deadline"> · ${escapeHtml(item.deadline)}</span>`
        : "";
      const metaBits = [
        sourceName,
        item.type || "",
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");
      return `
        <article class="${itemClass}" data-index="${index}">
          <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <h2 class="simple-title">${escapeHtml(item.title)}</h2>
            <p class="simple-meta">${metaBits}${deadline}</p>
            <p class="simple-summary">${escapeHtml(item.summary)}</p>
          </a>
          <div class="result-actions">
            <a class="result-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open original →</a>
            <button type="button" class="notion-save-btn" data-index="${index}">Save to Notion</button>
          </div>
        </article>`;
    })
    .join("");

  container.querySelectorAll(".notion-save-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const idx = Number(button.dataset.index);
      const item = items[idx];
      if (!item) return;
      const source = sourceById(sources, item.sourceId);
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await saveOpportunityToNotion(item, source?.name || "");
        button.textContent = "Saved";
      } catch (error) {
        console.error(error);
        button.textContent = "Failed";
        window.alert(
          "Could not save to Notion.\n\nConnect once under Library → Connect Notion.\nThen each Save uses those saved details.\n\n" +
            (error?.message || "")
        );
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 1600);
        return;
      }
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1800);
    });
  });
}

function wirePdfButton() {
  const link = document.getElementById("pdf-link");
  if (!link) return;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.print();
  });
}

export {
  SOURCES_KEY,
  NOTION_KEY,
  CATEGORY_DEFS,
  CONTINENT_KEYWORDS,
  normalize,
  escapeHtml,
  sourceById,
  matchesQuery,
  classifyItem,
  matchesFilters,
  loadCustomSources,
  saveCustomSources,
  loadBaseSources,
  loadFileCustomSources,
  loadAllSources,
  addLibrarySource,
  removeLibrarySource,
  triggerScrape,
  migrateBrowserSourcesToServer,
  slugify,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
  saveOpportunityToNotion,
  renderResultCards,
  wirePdfButton,
};
