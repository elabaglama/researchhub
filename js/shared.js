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

async function loadAllSources() {
  const base = await fetch("data/sources.json").then((r) => r.json());
  const custom = loadCustomSources();
  const seen = new Set(base.map((s) => s.id));
  const merged = [...base];
  for (const source of custom) {
    if (!seen.has(source.id)) {
      merged.push(source);
      seen.add(source.id);
    }
  }
  return merged;
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
  normalize,
  escapeHtml,
  sourceById,
  matchesQuery,
  loadCustomSources,
  saveCustomSources,
  loadAllSources,
  slugify,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
  saveOpportunityToNotion,
  renderResultCards,
  wirePdfButton,
};
