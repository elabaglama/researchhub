import {
  buildSearchUrl,
  escapeHtml,
  matchesQuery,
  renderSimpleItems,
  wirePdfButton,
} from "./shared.js";

const params = new URLSearchParams(window.location.search);
const query = (params.get("q") || "").trim();

const els = {
  query: document.getElementById("query"),
  meta: document.getElementById("results-meta"),
  list: document.getElementById("results-list"),
  sourceSearches: document.getElementById("source-searches"),
};

els.query.value = query;
document.title = query ? `${query} — Research Hub` : "Results — Research Hub";

wirePdfButton();

const [sources, opportunities] = await Promise.all([
  fetch("/data/sources.json").then((r) => r.json()),
  fetch("/data/opportunities.json").then((r) => r.json()),
]);

const results = opportunities.filter((item) => matchesQuery(item, query));

els.meta.textContent = query
  ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”`
  : "Enter a keyword to search the library.";

renderSimpleItems(els.list, results, sources);

if (query) {
  els.sourceSearches.innerHTML = `
    <h2>Search live sources</h2>
    ${sources
      .map((source) => {
        const href = buildSearchUrl(source, query);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">Search ${escapeHtml(source.name)} →</a>`;
      })
      .join("")}
  `;
}
