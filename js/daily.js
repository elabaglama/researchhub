import {
  escapeHtml,
  sourceById,
  saveOpportunityToNotion,
  classifyItem,
  CATEGORY_DEFS,
  wirePdfButton,
  filterOpportunitiesBySources,
  loadLibraryCache,
  loadRemovedSourceIds,
  mergePersonalSources,
} from "./shared.js";
import { currentUser, onUserChange } from "./auth.js";
import { loadUserPrefs, saveUserPrefs, loadUserSources } from "./firebase.js";

wirePdfButton();

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
document.getElementById("daily-meta").textContent = today;

// ── Preferences ─────────────────────────────────────────────────────────────

const ALL_KEYS = CATEGORY_DEFS.map((c) => c.key);
let enabledKeys = new Set(ALL_KEYS); // default: all on

async function loadPrefs() {
  if (!currentUser) return;
  try {
    const prefs = await loadUserPrefs(currentUser.uid);
    if (Array.isArray(prefs.dailyColumns) && prefs.dailyColumns.length) {
      enabledKeys = new Set(prefs.dailyColumns);
    } else {
      enabledKeys = new Set(ALL_KEYS);
    }
  } catch {
    // keep defaults
  }
}

async function savePrefs() {
  if (!currentUser) return;
  try {
    await saveUserPrefs(currentUser.uid, {
      dailyColumns: [...enabledKeys],
    });
  } catch {
    // silent
  }
}

// ── Preferences panel wiring ─────────────────────────────────────────────────

const customizeBtn = document.getElementById("customize-btn");
const prefsOverlay = document.getElementById("prefs-overlay");
const prefsCloseBtn = document.getElementById("prefs-close-btn");
const prefsToggles = document.getElementById("prefs-toggles");
const prefsSaveBtn = document.getElementById("prefs-save-btn");

function openPrefsPanel() {
  renderToggles();
  prefsOverlay.hidden = false;
  customizeBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closePrefsPanel() {
  prefsOverlay.hidden = true;
  customizeBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function renderToggles() {
  prefsToggles.innerHTML = CATEGORY_DEFS.map((cat) => {
    const checked = enabledKeys.has(cat.key) ? "checked" : "";
    return `
      <label class="prefs-toggle-row">
        <span class="prefs-toggle-label">${escapeHtml(cat.label)}</span>
        <span class="prefs-switch">
          <input type="checkbox" class="prefs-checkbox" data-key="${cat.key}" ${checked} />
          <span class="prefs-slider"></span>
        </span>
      </label>`;
  }).join("");

  prefsToggles.querySelectorAll(".prefs-checkbox").forEach((cb) => {
    cb.addEventListener("change", async () => {
      if (cb.checked) {
        enabledKeys.add(cb.dataset.key);
      } else {
        if (enabledKeys.size > 1) enabledKeys.delete(cb.dataset.key);
        else cb.checked = true;
      }
      await savePrefs();
      renderReport();
    });
  });
}

customizeBtn.addEventListener("click", openPrefsPanel);
prefsCloseBtn.addEventListener("click", closePrefsPanel);
prefsSaveBtn.addEventListener("click", closePrefsPanel);
prefsOverlay.addEventListener("click", (e) => {
  if (e.target === prefsOverlay) closePrefsPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !prefsOverlay.hidden) closePrefsPanel();
});

// ── Data ─────────────────────────────────────────────────────────────────────

const allOpportunities = await fetch("data/opportunities.json").then((r) =>
  r.json()
);

let sources = [];
let byCategory = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.key, []]));

async function loadPersonalSources() {
  if (!currentUser) return [];
  const uid = currentUser.uid;
  const [firestoreSources, cached] = await Promise.all([
    loadUserSources(uid),
    Promise.resolve(loadLibraryCache(uid)),
  ]);
  return mergePersonalSources(
    firestoreSources,
    cached,
    loadRemovedSourceIds(uid)
  );
}

function rebuildCategories(opportunities) {
  byCategory = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.key, []]));
  for (const item of opportunities) {
    const key = classifyItem(item);
    if (byCategory[key]) byCategory[key].push(item);
  }
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const aOpen = !a.deadline || a.deadline.toLowerCase() === "open";
    const bOpen = !b.deadline || b.deadline.toLowerCase() === "open";
    return aOpen === bOpen ? 0 : aOpen ? 1 : -1;
  });
}

// ── Render ───────────────────────────────────────────────────────────────────

const root = document.getElementById("daily-columns");

function renderReport() {
  root.innerHTML = "";

  const activeCategories = CATEGORY_DEFS.filter(
    (cat) => enabledKeys.has(cat.key) && byCategory[cat.key].length > 0
  );

  if (!activeCategories.length) {
    root.innerHTML = `<p class="empty-note">${
      sources.length
        ? "No opportunities available for the selected categories yet."
        : "Your library is empty. Add resources on the Library page, then Sync to fill your daily report."
    }</p>`;
    return;
  }

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

async function refreshFeed() {
  sources = await loadPersonalSources();
  const opportunities = filterOpportunitiesBySources(allOpportunities, sources);
  rebuildCategories(opportunities);
  renderReport();
}

// ── Boot ─────────────────────────────────────────────────────────────────────

await loadPrefs();
await refreshFeed();

onUserChange(async () => {
  await loadPrefs();
  await refreshFeed();
});
