import { renderSimpleItems, wirePdfButton } from "./shared.js";

wirePdfButton();

const today = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

document.getElementById("daily-meta").textContent = today;

const [sources, opportunities] = await Promise.all([
  fetch("/data/sources.json").then((r) => r.json()),
  fetch("/data/opportunities.json").then((r) => r.json()),
]);

// Starter digest: first entries across the indexed library.
renderSimpleItems(
  document.getElementById("daily-list"),
  opportunities.slice(0, 8),
  sources
);
