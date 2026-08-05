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
const body = document.body;

const filterType = document.getElementById("filter-type");
const filterContinent = document.getElementById("filter-continent");
const filterCountry = document.getElementById("filter-country");
const filterAge = document.getElementById("filter-age");

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

const countNumber = document.getElementById("count-number");
if (countNumber) {
  countNumber.textContent = String(opportunities.length);
}

function getActiveFilters() {
  return {
    type: filterType?.value || "",
    continent: filterContinent?.value || "",
    country: filterCountry?.value?.trim() || "",
    age: filterAge?.value || "",
  };
}

function hasActiveFilters(filters) {
  return Boolean(filters.type || filters.continent || filters.country || filters.age);
}

function buildFilterLabel(filters) {
  const parts = [];
  if (filters.type) parts.push(filterType.options[filterType.selectedIndex]?.text || filters.type);
  if (filters.continent) parts.push(filterContinent.options[filterContinent.selectedIndex]?.text || filters.continent);
  if (filters.country) parts.push(filters.country);
  if (filters.age) parts.push(filterAge.options[filterAge.selectedIndex]?.text || filters.age);
  return parts.join(", ");
}

function markActiveFilters(filters) {
  filterType?.classList.toggle("filter-active", Boolean(filters.type));
  filterContinent?.classList.toggle("filter-active", Boolean(filters.continent));
  filterCountry?.classList.toggle("filter-active", Boolean(filters.country));
  filterAge?.classList.toggle("filter-active", Boolean(filters.age));
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

input.addEventListener("input", () => {
  runSearch(input.value);
});

filterType?.addEventListener("change", () => runSearch(input.value));
filterContinent?.addEventListener("change", () => runSearch(input.value));
filterCountry?.addEventListener("input", () => runSearch(input.value));
filterAge?.addEventListener("change", () => runSearch(input.value));

const initial = new URLSearchParams(window.location.search).get("q") || "";
if (initial) {
  input.value = initial;
  runSearch(initial);
}
