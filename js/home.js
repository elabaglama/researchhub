import {
  matchesQuery,
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

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

function runSearch(query) {
  const q = query.trim();
  const url = new URL(window.location.href);

  if (!q) {
    body.classList.remove("is-searching");
    resultsSection.hidden = true;
    resultsList.innerHTML = "";
    resultsMeta.textContent = "";
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
    document.title = "Research Hub";
    return;
  }

  const results = opportunities.filter((item) => matchesQuery(item, q));
  body.classList.add("is-searching");
  resultsSection.hidden = false;
  resultsMeta.textContent = `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`;
  renderResultCards(resultsList, results, sources, { carded: true });
  url.searchParams.set("q", q);
  window.history.replaceState({}, "", url);
  document.title = `${q} — Research Hub`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

input.addEventListener("input", () => {
  runSearch(input.value);
});

const initial = new URLSearchParams(window.location.search).get("q") || "";
if (initial) {
  input.value = initial;
  runSearch(initial);
}
