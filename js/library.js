import {
  escapeHtml,
  wirePdfButton,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
  addLibrarySource,
  triggerScrape,
  loadLibraryCache,
  saveLibraryCache,
  loadRemovedSourceIds,
  markRemovedSourceId,
  unmarkRemovedSourceId,
  mergePersonalSources,
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

/** In-memory list for the signed-in user's library. */
let userSources = [];

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

function paintList(sources) {
  if (!sources.length) {
    list.innerHTML = `
      <p class="empty-note">
        Your library is empty. Add a resource to start building your personal feed —
        Sync will scrape whatever you add here.
      </p>`;
    return;
  }

  list.innerHTML = sources
    .map((source) => {
      return `
        <article class="simple-item" data-id="${escapeHtml(source.id)}">
          <a class="result-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            <h2 class="simple-title">${escapeHtml(source.name)} <span class="saved-tag">Library</span></h2>
            <p class="simple-meta">${escapeHtml(source.focus || "Resource")}</p>
            <p class="simple-summary">${escapeHtml(source.blurb || source.url)}</p>
          </a>
          <div class="result-actions">
            <button type="button" class="notion-save-btn resync-btn" data-id="${escapeHtml(source.id)}">Re-scrape</button>
            <button type="button" class="notion-save-btn remove-btn" data-id="${escapeHtml(source.id)}">Remove</button>
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
      if (!window.confirm("Remove this source from your library?")) return;
      if (!currentUser) return;

      const us = userSources.find((s) => s.id === id);
      const card = button.closest("article");
      button.disabled = true;

      // Persist removal locally FIRST so navigation never resurrects the card
      markRemovedSourceId(currentUser.uid, id);
      userSources = userSources.filter((s) => s.id !== id);
      saveLibraryCache(currentUser.uid, userSources);
      if (card) card.remove();
      if (!userSources.length) paintList([]);
      setSyncStatus("Removing…");

      if (us?._docId) {
        const ok = await removeUserSource(currentUser.uid, us._docId);
        if (!ok) {
          setSyncStatus(
            "Removed from this device. Cloud delete couldn't confirm — it stays hidden here."
          );
          return;
        }
      }
      setSyncStatus("Removed from your library.");
    });
  });
}

/**
 * Signed-in library = THIS user's Firestore sources only (empty for new accounts).
 * Local removed-ids + cache keep removals sticky across page navigations.
 */
async function renderLibrary() {
  if (!currentUser) {
    list.innerHTML = `<p class="empty-note">Sign in to manage your personal library.</p>`;
    userSources = [];
    return;
  }

  const uid = currentUser.uid;
  const [firestoreSources, cached] = await Promise.all([
    loadUserSources(uid),
    Promise.resolve(loadLibraryCache(uid)),
  ]);

  userSources = mergePersonalSources(
    firestoreSources,
    cached,
    loadRemovedSourceIds(uid)
  );
  saveLibraryCache(uid, userSources);
  paintList(userSources);
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
  if (!currentUser) {
    setSyncStatus("Sign in to sync your library.");
    return;
  }
  if (!userSources.length) {
    setSyncStatus("Your library is empty — add a resource first, then Sync.");
    return;
  }

  syncAllBtn.disabled = true;
  syncAllBtn.textContent = "Syncing…";
  setSyncStatus(`Scraping your ${userSources.length} source${userSources.length === 1 ? "" : "s"}…`);

  try {
    let lastReport = null;
    for (const source of userSources) {
      setSyncStatus(`Scraping ${source.name || source.id}…`);
      const data = await triggerScrape({ sourceId: source.id });
      lastReport = data.report || lastReport;
    }
    const total =
      typeof lastReport?.total === "number" ? lastReport.total : null;
    setSyncStatus(
      total != null
        ? `Synced your library. Search uses only sources you added — updates land when the scrape finishes.`
        : "Synced your library. Search updates in a few minutes when the scrape finishes."
    );
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
  if (!currentUser) {
    setSyncStatus("Sign in to add resources to your library.");
    return;
  }

  saveResourceBtn.disabled = true;
  saveResourceBtn.textContent = "Saving & scraping…";
  setSyncStatus("Adding source and scraping listings…");

  try {
    // 1) Register in the shared scrape queue so GitHub Actions can index it
    const result = await addLibrarySource(url, { scrape: true });
    const source = result.source;
    if (!source) throw new Error("Could not create source");

    unmarkRemovedSourceId(currentUser.uid, source.id);

    // 2) Save to THIS user's personal library (Firestore + local cache)
    const docId = await addUserSource(currentUser.uid, {
      id: source.id,
      url: source.url,
      name: source.name || url,
      focus: source.focus || "custom",
      blurb: source.blurb || url,
      custom: true,
    });

    const entry = {
      id: source.id,
      url: source.url,
      name: source.name || url,
      focus: source.focus || "custom",
      blurb: source.blurb || url,
      custom: true,
      _docId: docId || undefined,
    };

    if (!userSources.some((s) => s.id === entry.id)) {
      userSources.push(entry);
    } else {
      userSources = userSources.map((s) => (s.id === entry.id ? { ...s, ...entry } : s));
    }
    saveLibraryCache(currentUser.uid, userSources);

    setSyncStatus(
      `${source.name} saved to your library. ${scrapeSummary(result.scrape, source.id)}`
    );
    form.reset();
    form.hidden = true;
    paintList(userSources);
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

// Re-render when user signs in or out
onUserChange(() => renderLibrary().catch(() => {}));

fillNotionForm();
refreshNotionStatus();
setSyncStatus("Library ready. Add links here — Sync scrapes only what you added.");

await renderLibrary();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
