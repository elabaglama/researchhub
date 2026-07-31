import {
  escapeHtml,
  loadAllSources,
  renderResultCards,
  wirePdfButton,
} from "./shared.js";

wirePdfButton();

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

document.getElementById("daily-meta").textContent =
  `${today} · Fresh picks, each linked to its original page.`;

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

const root = document.getElementById("daily-list");

// Mixed digest: prefer items with real deadlines, keep source variety without grouping.
const withDeadline = [];
const open = [];
for (const item of opportunities) {
  const d = String(item.deadline || "").trim();
  if (d && d.toLowerCase() !== "open") withDeadline.push(item);
  else open.push(item);
}

const picks = [];
const seenSources = new Map();
const pool = [...withDeadline, ...open];

for (const item of pool) {
  if (picks.length >= 12) break;
  const count = seenSources.get(item.sourceId) || 0;
  if (count >= 5) continue;
  picks.push(item);
  seenSources.set(item.sourceId, count + 1);
}

root.innerHTML = "";
root.className = "simple-list";

if (!picks.length) {
  root.innerHTML = `<p class="empty-note">No opportunities available yet. Wait for the next automatic scrape.</p>`;
} else {
  renderResultCards(root, picks, sources);
}
