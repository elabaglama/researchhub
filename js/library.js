import {
  escapeHtml,
  loadBaseSources,
  loadAllSources,
  loadFileCustomSources,
  wirePdfButton,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
  addLibrarySource,
  removeLibrarySource,
  triggerScrape,
  migrateBrowserSourcesToServer,
} from "./shared.js";
import {
  currentUser,
  onUserChange,
  persistNotionToFirestore,
} from "./auth.js";
import {
  loadUserSources,
  addUserSource,
  removeUserSource,
  loadUserPrefs,
  saveUserPrefs,
} from "./firebase.js";

wirePdfButton();

const list = document.getElementById("library-list");
const addBtn = document.getElementById("add-resource-btn");
const form = document.getElementById("add-resource-form");
const cancelBtn = document.getElementById("cancel-add-btn");
const saveResourceBtn = document.getElementById("save-resource-btn");
const syncAllBtn = document.getElementById("sync-all-btn");
const syncStatus = document.getElementById("sync-status");
const notionForm = document.getElementById("notion-form");
const notionDisconnect = document.getElementById("notion-disconnect-btn");
const notionStatus = document.getElementById("notion-status");
const notionSaveBtn = document.getElementById("notion-save-btn");
const notionOverlay = document.getElementById("notion-overlay");
const notionToggleBtn = document.getElementById("notion-toggle-btn");
const notionCloseBtn = document.getElementById("notion-close-btn");

function openNotionPopup() {
  notionOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  notionForm.querySelector("input[name='token']").focus();
}

function closeNotionPopup() {
  notionOverlay.hidden = true;
  document.body.style.overflow = "";
}

notionToggleBtn.addEventListener("click", openNotionPopup);
notionCloseBtn.addEventListener("click", closeNotionPopup);
notionOverlay.addEventListener("click", (e) => {
  if (e.target === notionOverlay) closeNotionPopup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !notionOverlay.hidden) closeNotionPopup();
});

function fillNotionForm() {
  const config = getNotionConfig();
  notionForm.querySelector("input[name='token']").value = config.token || "";
  notionForm.querySelector("input[name='databaseId']").value =
    config.databaseId || "c4e56b17d92d40b59aeb00878c6066eb";
}

function refreshNotionStatus(extra = "") {
  const connected = isNotionConnected();
  if (connected) {
    notionStatus.textContent =
      extra || "Notion connected — Save to Notion is one click on any opportunity.";
    notionToggleBtn.textContent = "Notion ●";
    notionToggleBtn.title = "Notion connected";
  } else {
    notionStatus.textContent =
      extra || "Paste your integration secret once below, then save.";
    notionToggleBtn.textContent = "Connect Notion";
    notionToggleBtn.title = "Connect Notion";
  }
}

function setSyncStatus(message) {
  syncStatus.textContent = message || "";
}

function scrapeSummary(report, sourceId) {
  if (!report) return "No scrape ran.";
  if (report.pending) {
    return (
      report.message ||
      "Scrape started now. Search updates in a few minutes when GitHub Actions finishes."
    );
  }
  const entry = report.sources?.[sourceId];
  if (entry?.ok) return `Scraped ${entry.count} items (${entry.mode || "auto"}).`;
  if (entry && !entry.ok) return `Scrape failed: ${entry.error || "unknown error"}`;
  if (typeof report.total === "number") {
    return `Hub now has ${report.total} opportunities.`;
  }
  return report.message || "Scrape finished.";
}

async function renderLibrary() {
  let sources;
  let userSources = [];
  let hiddenIds = new Set();
  let firestoreIds = new Set();

  if (currentUser) {
    // Signed in: base sources + THIS user's own Firestore sources only.
    const [base, firestoreSources, prefs] = await Promise.all([
      loadBaseSources(),
      loadUserSources(currentUser.uid),
      loadUserPrefs(currentUser.uid),
    ]);
    userSources = firestoreSources;
    hiddenIds = new Set(Array.isArray(prefs.hiddenSources) ? prefs.hiddenSources : []);
    firestoreIds = new Set(userSources.map((s) => s.id));

    sources = [...base];
    const knownIds = new Set(base.map((s) => s.id));
    for (const us of userSources) {
      if (!knownIds.has(us.id)) {
        sources.push({ ...us, custom: true });
        knownIds.add(us.id);
      }
    }
    // Filter out sources the user has hidden
    sources = sources.filter((s) => !hiddenIds.has(s.id));
  } else {
    // Signed out: all sources (base + file custom)
    const [allSources] = await Promise.all([loadAllSources()]);
    sources = allSources;
  }

  list.innerHTML = sources
    .map((source) => {
      const isUserOwned = firestoreIds.has(source.id) || source.custom;
      const tag = isUserOwned ? ` <span class="saved-tag">Library</span>` : "";
      return `
        <article class="simple-item">
          <a class="result-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            <h2 class="simple-title">${escapeHtml(source.name)}${tag}</h2>
            <p class="simple-meta">${escapeHtml(source.focus || "Resource")}</p>
            <p class="simple-summary">${escapeHtml(source.blurb || source.url)}</p>
          </a>
          <div class="result-actions">
            <button type="button" class="notion-save-btn resync-btn" data-id="${escapeHtml(source.id)}">Re-scrape</button>
            <button type="button" class="notion-save-btn remove-btn" data-id="${escapeHtml(source.id)}" data-owned="${isUserOwned}">Remove</button>
          </div>
        </article>`;
    })
    .join("");

  list.querySelectorAll(".resync-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      button.disabled = true;
      button.textContent = "Scraping…";
      setSyncStatus(`Scraping ${id}…`);
      try {
        const data = await triggerScrape({ sourceId: id });
        setSyncStatus(scrapeSummary(data.report, id));
      } catch (error) {
        setSyncStatus(error.message || "Scrape failed");
      } finally {
        button.disabled = false;
        button.textContent = "Re-scrape";
      }
    });
  });

  list.querySelectorAll(".remove-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const isOwned = button.dataset.owned === "true";
      if (!window.confirm(`Remove this source from your library?`)) return;
      button.disabled = true;
      try {
        if (currentUser) {
          if (isOwned) {
            // User's own Firestore source — delete the document
            const us = userSources.find((s) => s.id === id);
            if (us?._docId) await removeUserSource(currentUser.uid, us._docId);
          } else {
            // Base source — hide it in user prefs so it disappears for this user
            const updatedHidden = [...hiddenIds, id];
            await saveUserPrefs(currentUser.uid, { hiddenSources: updatedHidden });
          }
        } else {
          // Fallback: server API (not signed in)
          await removeLibrarySource(id);
        }
        setSyncStatus(`Removed from your library.`);
        await renderLibrary();
      } catch (error) {
        setSyncStatus(error.message || "Remove failed");
        button.disabled = false;
      }
    });
  });
}

addBtn.addEventListener("click", () => {
  form.hidden = false;
  form.querySelector("input[name='url']").focus();
});

cancelBtn.addEventListener("click", () => {
  form.hidden = true;
  form.reset();
});

syncAllBtn.addEventListener("click", async () => {
  syncAllBtn.disabled = true;
  syncAllBtn.textContent = "Syncing…";
  setSyncStatus("Scraping every source… this can take a minute.");
  try {
    const data = await triggerScrape();
    setSyncStatus(`Synced. ${data.report?.total ?? 0} opportunities indexed.`);
  } catch (error) {
    setSyncStatus(
      error.message ||
        "Sync failed. On the live site, set GITHUB_TOKEN in Vercel. Locally, npm start still works."
    );
  } finally {
    syncAllBtn.disabled = false;
    syncAllBtn.textContent = "Sync all";
  }
});

notionDisconnect.addEventListener("click", () => {
  clearNotionConfig();
  fillNotionForm();
  refreshNotionStatus("Disconnected.");
  closeNotionPopup();
});

notionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(notionForm);
  const token = String(data.get("token") || "").trim();
  const databaseId = String(data.get("databaseId") || "")
    .trim()
    .replace(/-/g, "");
  if (!token || !databaseId) return;

  saveNotionConfig({ token, databaseId });
  const original = notionSaveBtn.textContent;
  notionSaveBtn.disabled = true;
  notionSaveBtn.textContent = "Testing…";
  refreshNotionStatus("Saved locally. Testing Notion access…");

  // Persist to Firestore so it's available on any device when signed in
  if (currentUser) {
    persistNotionToFirestore(currentUser.uid, { token, databaseId }).catch(() => {});
  }

  try {
    const response = await fetch("/api/test-notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, databaseId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error ||
          payload.message ||
          "Could not reach Notion. Share the database with your integration."
      );
    }
    const props = (payload.properties || []).join(", ") || "ok";
    refreshNotionStatus(`Connected. Database properties: ${props}`);
  } catch (error) {
    refreshNotionStatus(
      `Saved in this browser, but test failed: ${error.message || error}. Check the integration is invited to the database.`
    );
  } finally {
    notionSaveBtn.disabled = false;
    notionSaveBtn.textContent = original;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const url = String(data.get("url") || "").trim();
  if (!url) return;

  saveResourceBtn.disabled = true;
  saveResourceBtn.textContent = "Saving & scraping…";
  setSyncStatus("Adding source and scraping listings…");

  try {
    const result = await addLibrarySource(url, { scrape: true });
    const source = result.source;
    // Also save to Firestore so it persists across devices when signed in
    if (currentUser && source) {
      await addUserSource(currentUser.uid, {
        id: source.id,
        url: source.url,
        name: source.name || url,
        focus: source.focus || "custom",
        blurb: source.blurb || url,
        custom: true,
      });
    }
    setSyncStatus(
      `${source.name} saved. ${scrapeSummary(result.scrape, source.id)}`
    );
    form.reset();
    form.hidden = true;
    await renderLibrary();
  } catch (error) {
    setSyncStatus(
      error.message ||
        "Could not add source. On the live site this uses cloud sync; locally use npm start."
    );
  } finally {
    saveResourceBtn.disabled = false;
    saveResourceBtn.textContent = "Save & scrape";
  }
});

// Re-render when user signs in or out so their sources appear/disappear
onUserChange(() => renderLibrary().catch(() => {}));

fillNotionForm();
refreshNotionStatus();
setSyncStatus("Checking library sync…");

try {
  const migrated = await migrateBrowserSourcesToServer();
  if (migrated.migrated) {
    setSyncStatus(`Migrated ${migrated.migrated} older library link(s) and scraped them.`);
  } else {
    setSyncStatus("Library ready. New links sync in the cloud automatically.");
  }
} catch {
  setSyncStatus("Library ready. New links sync via the live site cloud APIs.");
}

await renderLibrary();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
