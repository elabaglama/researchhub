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
  `${today} · Fresh picks from each source, each linked to its original page.`;

const [sources, opportunities] = await Promise.all([
  loadAllSources(),
  fetch("data/opportunities.json").then((r) => r.json()),
]);

const root = document.getElementById("daily-list");

// Build a daily digest: up to 4 newest/first items per source, clearly separated.
const bySource = new Map();
for (const item of opportunities) {
  if (!bySource.has(item.sourceId)) bySource.set(item.sourceId, []);
  const list = bySource.get(item.sourceId);
  if (list.length < 4) list.push(item);
}

root.innerHTML = "";

for (const source of sources) {
  const items = bySource.get(source.id) || [];
  if (!items.length) continue;

  const section = document.createElement("section");
  section.className = "daily-group";
  section.innerHTML = `
    <div class="daily-group-head">
      <h2>${escapeHtml(source.name)}</h2>
      <a class="daily-source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Visit source →</a>
    </div>
    <div class="daily-group-list"></div>
  `;
  root.appendChild(section);
  renderResultCards(section.querySelector(".daily-group-list"), items, sources);
}

if (!root.children.length) {
  root.innerHTML = `<p class="empty-note">No opportunities available yet. Wait for the next automatic scrape.</p>`;
}
