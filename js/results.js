import {
  matchesQuery,
  renderResultCards,
  wireXlsButton,
  loadLibraryCache,
  loadRemovedSourceIds,
  mergePersonalSources,
} from "./shared.js?v=20260806b";
import { currentUser, onUserChange } from "./auth.js?v=20260806b";
import {
  loadUserSources,
  loadScrapeCaches,
  opportunitiesFromCaches,
} from "./firebase.js?v=20260806b";

// results.html redirects to index — keep export helper available if needed
void wireXlsButton;

const params = new URLSearchParams(window.location.search);
const query = (params.get("q") || "").trim();

const els = {
  query: document.getElementById("query"),
  meta: document.getElementById("results-meta"),
  list: document.getElementById("results-list"),
};

if (els.query) els.query.value = query;
document.title = query ? `${query} — Research Hub` : "Results — Research Hub";

async function loadPersonalSources() {
  if (!currentUser) return [];
  const uid = currentUser.uid;
  const [loadResult, cached] = await Promise.all([
    loadUserSources(uid),
    Promise.resolve(loadLibraryCache(uid)),
  ]);
  return mergePersonalSources(
    loadResult.sources || [],
    cached,
    loadRemovedSourceIds(uid)
  );
}

async function render() {
  const sources = await loadPersonalSources();
  const ids = sources.map((s) => s.id);
  const { caches } = await loadScrapeCaches(ids);
  const opportunities = opportunitiesFromCaches(caches, ids);

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
}

await render();
onUserChange(() => {
  render().catch(() => {});
});
