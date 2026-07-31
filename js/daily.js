import { renderResultCards, loadAllSources, wirePdfButton } from "./shared.js";

wirePdfButton();

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

document.getElementById("daily-meta").textContent = today;

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

renderResultCards(
  document.getElementById("daily-list"),
  opportunities.slice(0, 8),
  sources
);
