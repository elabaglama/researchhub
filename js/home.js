import {
  matchesQuery,
  matchesFilters,
  renderResultCards,
  loadAllSources,
  wirePdfButton,
} from "./shared.js";

wirePdfButton();

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

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

const countNumber = document.getElementById("count-number");
if (countNumber) {
  countNumber.textContent = String(opportunities.length);
}

function showFilters() {
  filtersEl?.classList.remove("search-filters--hidden");
}

function getActiveFilters() {
  return {
    type: filterType?.value || "",
    continent: filterContinent?.value || "",
    country: filterCountry?.value?.trim() || "",
  };
}

function hasActiveFilters(filters) {
  return Boolean(filters.type || filters.continent || filters.country);
}

function buildFilterLabel(filters) {
  const parts = [];
  if (filters.type) parts.push(filterType.options[filterType.selectedIndex]?.text || filters.type);
  if (filters.continent) parts.push(filterContinent.options[filterContinent.selectedIndex]?.text || filters.continent);
  if (filters.country) parts.push(filters.country);
  return parts.join(", ");
}

function markActiveFilters(filters) {
  filterType?.classList.toggle("filter-active", Boolean(filters.type));
  filterContinent?.classList.toggle("filter-active", Boolean(filters.continent));
  filterCountry?.classList.toggle("filter-active", Boolean(filters.country));
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
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
    document.title = "Research Hub";
    return;
  }

  const results = opportunities.filter(
    (item) => matchesQuery(item, q) && matchesFilters(item, filters)
  );

  body.classList.add("is-searching");
  resultsSection.hidden = false;

  const filterLabel = buildFilterLabel(filters);
  const queryLabel = q ? `"${q}"` : "";
  const forLabel = [queryLabel, filterLabel].filter(Boolean).join(" · ");
  resultsMeta.textContent = `${results.length} result${results.length === 1 ? "" : "s"}${forLabel ? ` for ${forLabel}` : ""}`;

  renderResultCards(resultsList, results, sources, { carded: true });

  if (q) {
    url.searchParams.set("q", q);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", url);
  document.title = q ? `${q} — Research Hub` : "Research Hub";
}

// Show filters on first interaction with the search
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

// Also show filters when any filter is changed
filterType?.addEventListener("focus", showFilters);
filterContinent?.addEventListener("focus", showFilters);
filterCountry?.addEventListener("focus", showFilters);

const initial = new URLSearchParams(window.location.search).get("q") || "";
if (initial) {
  input.value = initial;
  showFilters();
  runSearch(initial);
}
