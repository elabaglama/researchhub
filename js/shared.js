const SOURCES_KEY = "research-hub-sources";

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

function renderResultCards(container, items, sources, { carded = false } = {}) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-note">No matches found.</p>`;
    return;
  }

  const itemClass = carded ? "result-card" : "simple-item";

  container.innerHTML = items
    .map((item) => {
      const source = sourceById(sources, item.sourceId);
      const sourceName = source?.name || "";
      const deadline = item.deadline
        ? `<span class="deadline">Deadline: ${escapeHtml(item.deadline)}</span>`
        : "";
      return `
        <a class="${itemClass}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          <h2 class="simple-title">${escapeHtml(item.title)}</h2>
          <p class="simple-meta">${escapeHtml(sourceName)}${item.type ? ` · ${escapeHtml(item.type)}` : ""}</p>
          ${deadline}
          <p class="simple-summary">${escapeHtml(item.summary)}</p>
        </a>`;
    })
    .join("");
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
  normalize,
  escapeHtml,
  sourceById,
  matchesQuery,
  loadCustomSources,
  saveCustomSources,
  loadAllSources,
  slugify,
  renderResultCards,
  wirePdfButton,
};
