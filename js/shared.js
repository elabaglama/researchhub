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

function buildSearchUrl(source, query) {
  return source.searchUrl.replace("{query}", encodeURIComponent(query.trim()));
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = normalize(
    [item.title, item.summary, item.type, ...(item.tags || [])].join(" ")
  );
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(normalize(token)));
}

function renderSimpleItems(container, items, sources) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-note">No matches found.</p>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const source = sourceById(sources, item.sourceId);
      const sourceName = source?.name || "";
      return `
        <a class="simple-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          <h2 class="simple-title">${escapeHtml(item.title)}</h2>
          <p class="simple-meta">${escapeHtml(sourceName)}${item.type ? ` · ${escapeHtml(item.type)}` : ""}</p>
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
  normalize,
  escapeHtml,
  sourceById,
  buildSearchUrl,
  matchesQuery,
  renderSimpleItems,
  wirePdfButton,
};
