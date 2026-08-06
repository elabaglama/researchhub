import {
  matchesQuery,
  matchesFilters,
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
import { t, initI18n, toggleLang } from "./i18n.js?v=20260806b";

initI18n();

document.getElementById("lang-toggle-btn")?.addEventListener("click", () => {
  toggleLang();
  runSearch(input.value);
});
window.addEventListener("langchange", () => {
  runSearch(input.value);
});

const form = document.getElementById("search-form");
const input = document.getElementById("query");
const resultsSection = document.getElementById("home-results");
const resultsMeta = document.getElementById("results-meta");
const resultsList = document.getElementById("results-list");
const filtersEl = document.getElementById("search-filters");
const body = document.body;

const filterType = document.getElementById("filter-type");
const filterContinent = document.getElementById("filter-continent");
const filterCountry = document.getElementById("filter-country");
const filterDate = document.getElementById("filter-date");
const countNumber = document.getElementById("count-number");

let sources = [];
let opportunities = [];
let lastResults = [];

wireXlsButton(() => ({
  items: lastResults.length ? lastResults : opportunities,
  sources,
  filenamePrefix: "risultati-research-hub",
}));

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

function updateCount() {
  if (countNumber) {
    countNumber.textContent = String(opportunities.length);
  }
}

async function refreshFeed() {
  sources = await loadPersonalSources();
  const ids = sources.map((s) => s.id);
  const { caches } = await loadScrapeCaches(ids);
  opportunities = opportunitiesFromCaches(caches, ids);

  if (!opportunities.length && ids.length) {
    try {
      const all = await fetch("data/opportunities.json", { cache: "no-store" }).then((r) =>
        r.json()
      );
      const idSet = new Set(ids);
      opportunities = (Array.isArray(all) ? all : []).filter((item) =>
        idSet.has(item.sourceId)
      );
    } catch {
      /* ignore */
    }
  }

  updateCount();
  runSearch(input.value);
}

function showFilters() {
  filtersEl?.classList.remove("search-filters--hidden");
}

function getActiveFilters() {
  return {
    type: filterType?.value || "",
    continent: filterContinent?.value || "",
    country: filterCountry?.value?.trim() || "",
    date: filterDate?.value || "",
  };
}

function hasActiveFilters(filters) {
  return Boolean(filters.type || filters.continent || filters.country || filters.date);
}

function buildFilterLabel(filters) {
  const parts = [];
  if (filters.type) parts.push(filterType.options[filterType.selectedIndex]?.text || filters.type);
  if (filters.continent) parts.push(filterContinent.options[filterContinent.selectedIndex]?.text || filters.continent);
  if (filters.country) parts.push(filters.country);
  if (filters.date) parts.push(filterDate.options[filterDate.selectedIndex]?.text || filters.date);
  return parts.join(", ");
}

function markActiveFilters(filters) {
  filterType?.classList.toggle("filter-active", Boolean(filters.type));
  filterContinent?.classList.toggle("filter-active", Boolean(filters.continent));
  filterCountry?.classList.toggle("filter-active", Boolean(filters.country));
  filterDate?.classList.toggle("filter-active", Boolean(filters.date));
}

function runSearch(query) {
  const q = query.trim();
  const filters = getActiveFilters();
  const filtersOn = hasActiveFilters(filters);
  const url = new URL(window.location.href);

  markActiveFilters(filters);

  if (!q && !filtersOn) {
    body.classList.remove("is-searching");
    resultsSection.hidden = true;
    resultsList.innerHTML = "";
    resultsMeta.textContent = "";
    lastResults = [];
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
    document.title = "Research Hub";
    return;
  }

  const results = opportunities.filter(
    (item) => matchesQuery(item, q) && matchesFilters(item, filters)
  );
  lastResults = results;

  body.classList.add("is-searching");
  resultsSection.hidden = false;

  const filterLabel = buildFilterLabel(filters);
  const queryLabel = q ? `"${q}"` : "";
  const forLabel = [queryLabel, filterLabel].filter(Boolean).join(" · ");
  const countLabel = results.length === 1 ? t("results.count1") : t("results.countN");
  resultsMeta.textContent = `${results.length} ${countLabel}${forLabel ? ` ${t("results.for")} ${forLabel}` : ""}`;

  renderResultCards(resultsList, results, sources, { carded: true });

  if (q) {
    url.searchParams.set("q", q);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", url);
  document.title = q ? `${q} — Research Hub` : "Research Hub";
}

input.addEventListener("focus", showFilters);
input.addEventListener("input", () => {
  showFilters();
  runSearch(input.value);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

filterType?.addEventListener("change", () => runSearch(input.value));
filterContinent?.addEventListener("change", () => runSearch(input.value));
filterCountry?.addEventListener("input", () => runSearch(input.value));
filterDate?.addEventListener("change", () => runSearch(input.value));

filterType?.addEventListener("focus", showFilters);
filterContinent?.addEventListener("focus", showFilters);
filterCountry?.addEventListener("focus", showFilters);
filterDate?.addEventListener("focus", showFilters);

await refreshFeed();

onUserChange(() => {
  refreshFeed().catch(() => {});
});

const initial = new URLSearchParams(window.location.search).get("q") || "";
if (initial) {
  input.value = initial;
  showFilters();
  runSearch(initial);
}
