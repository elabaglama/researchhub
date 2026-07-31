import { matchesQuery, renderResultCards, loadAllSources, wirePdfButton } from "./shared.js";

wirePdfButton();

const params = new URLSearchParams(window.location.search);
const query = (params.get("q") || "").trim();

const els = {
  query: document.getElementById("query"),
  meta: document.getElementById("results-meta"),
  list: document.getElementById("results-list"),
};

if (els.query) els.query.value = query;
document.title = query ? `${query} — Research Hub` : "Results — Research Hub";

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

const results = query
  ? opportunities.filter((item) => matchesQuery(item, query))
  : [];

if (els.meta) {
  els.meta.textContent = query
    ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”`
    : "Search from the home page.";
}

if (els.list) {
  renderResultCards(els.list, results, sources, { carded: true });
}
