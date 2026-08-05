import {
  escapeHtml,
  loadAllSources,
  sourceById,
  saveOpportunityToNotion,
  classifyItem,
  CATEGORY_DEFS,
  wirePdfButton,
} from "./shared.js";

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

// Group items by category
const byCategory = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.key, []]));
for (const item of opportunities) {
  const key = classifyItem(item);
  if (byCategory[key]) byCategory[key].push(item);
}

// Items with real deadlines come first within each category
function sortItems(items) {
  return [...items].sort((a, b) => {
    const aOpen = !a.deadline || a.deadline.toLowerCase() === "open";
    const bOpen = !b.deadline || b.deadline.toLowerCase() === "open";
    return aOpen === bOpen ? 0 : aOpen ? 1 : -1;
  });
}

const root = document.getElementById("daily-columns");
root.innerHTML = "";

const activeCategories = CATEGORY_DEFS.filter((cat) => byCategory[cat.key].length > 0);

if (!activeCategories.length) {
  root.innerHTML = `<p class="empty-note">No opportunities available yet. Wait for the next automatic scrape.</p>`;
} else {
  const allItems = [];

  for (const cat of activeCategories) {
    const items = sortItems(byCategory[cat.key]).slice(0, 7);
    const startIdx = allItems.length;
    allItems.push(...items);

    const section = document.createElement("section");
    section.className = "daily-column";
    section.setAttribute("aria-label", cat.label);

    const header = document.createElement("h2");
    header.className = "daily-column-title";
    header.textContent = cat.label;
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "daily-column-list";

    list.innerHTML = items
      .map((item, i) => {
        const globalIdx = startIdx + i;
        const source = sourceById(sources, item.sourceId);
        const sourceName = source?.name || "";
        const deadline = item.deadline
          ? `<span class="deadline"> · ${escapeHtml(item.deadline)}</span>`
          : "";
        const metaBits = [sourceName, item.type]
          .filter(Boolean)
          .map(escapeHtml)
          .join(" · ");

        return `
          <article class="daily-item" data-index="${globalIdx}">
            <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
              <h3 class="daily-item-title">${escapeHtml(item.title)}</h3>
              <p class="simple-meta">${metaBits}${deadline}</p>
              <p class="simple-summary">${escapeHtml(item.summary)}</p>
            </a>
            <div class="result-actions">
              <a class="result-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open →</a>
              <button type="button" class="notion-save-btn" data-index="${globalIdx}">Save to Notion</button>
            </div>
          </article>`;
      })
      .join("");

    section.appendChild(list);
    root.appendChild(section);
  }

  // Wire Notion save buttons
  root.querySelectorAll(".notion-save-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const idx = Number(button.dataset.index);
      const item = allItems[idx];
      if (!item) return;
      const source = sourceById(sources, item.sourceId);
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await saveOpportunityToNotion(item, source?.name || "");
        button.textContent = "Saved ✓";
      } catch (error) {
        console.error(error);
        button.textContent = "Failed";
        window.alert(
          "Could not save to Notion.\n\nConnect once under Library → Connect Notion.\n\n" +
            (error?.message || "")
        );
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 1600);
        return;
      }
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1800);
    });
  });
}
