import {
  escapeHtml,
  wirePdfButton,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
  triggerScrape,
  buildSourceFromUrl,
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
  getIdToken,
  loadScrapeCaches,
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
let cacheStatusById = {};

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

function scrapeSummary(report) {
  if (!report) return "No scrape ran.";
  if (report.pending) {
    return (
      report.message ||
      "Scraping… your feed updates when the cloud worker finishes."
    );
  }
  return report.message || "Scrape finished.";
}

function statusLabel(sourceId) {
  const status = cacheStatusById[sourceId];
  if (status === "pending") return ` <span class="saved-tag">Scraping…</span>`;
  if (status === "error") return ` <span class="saved-tag">Scrape failed</span>`;
  if (status === "ready") return ` <span class="saved-tag">Ready</span>`;
  return ` <span class="saved-tag">Library</span>`;
}

function paintList(sources) {
  if (!sources.length) {
    list.innerHTML = `
      <p class="empty-note">
        Your library is empty. Add a resource to start building your personal feed —
        Sync scrapes only what you added.
      </p>`;
    return;
  }

  list.innerHTML = sources
    .map((source) => {
      return `
        <article class="simple-item" data-id="${escapeHtml(source.id)}">
          <a class="result-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            <h2 class="simple-title">${escapeHtml(source.name)}${statusLabel(source.id)}</h2>
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
      const source = userSources.find((s) => s.id === id);
      button.disabled = true;
      button.textContent = "Scraping…";
      setSyncStatus(`Scraping ${source?.name || id}…`);
      try {
        const idToken = await getIdToken();
        const data = await triggerScrape({
          sourceId: id,
          url: source?.url,
          name: source?.name,
          idToken,
        });
        cacheStatusById[id] = "pending";
        paintList(userSources);
        setSyncStatus(scrapeSummary(data.report || data.scrape));
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

      markRemovedSourceId(currentUser.uid, id);
      userSources = userSources.filter((s) => s.id !== id);
      saveLibraryCache(currentUser.uid, userSources);
      if (card) card.remove();
      if (!userSources.length) paintList([]);
      setSyncStatus("Removing…");

      if (us?._docId) {
        const result = await removeUserSource(currentUser.uid, us._docId);
        if (!result.ok) {
          setSyncStatus(
            result.error ||
              "Removed on this device. Cloud delete failed — check Firestore rules."
          );
          return;
        }
      }
      setSyncStatus("Removed from your library.");
    });
  });
}

async function refreshCacheStatuses(sources) {
  const ids = sources.map((s) => s.id);
  const { ok, caches, error } = await loadScrapeCaches(ids);
  cacheStatusById = {};
  if (!ok) {
    return error || null;
  }
  let pending = 0;
  for (const id of ids) {
    const status = caches[id]?.status || (caches[id]?.items?.length ? "ready" : "");
    if (status) cacheStatusById[id] = status;
    if (status === "pending") pending += 1;
  }
  if (pending) {
    return `${pending} source${pending === 1 ? "" : "s"} still scraping…`;
  }
  return null;
}

/**
 * Signed-in library = THIS user's Firestore sources only (empty for new accounts).
 */
async function renderLibrary() {
  if (!currentUser) {
    list.innerHTML = `<p class="empty-note">Sign in to manage your personal library.</p>`;
    userSources = [];
    return;
  }

  const uid = currentUser.uid;
  const [loadResult, cached] = await Promise.all([
    loadUserSources(uid),
    Promise.resolve(loadLibraryCache(uid)),
  ]);

  if (!loadResult.ok && !(cached && cached.length)) {
    list.innerHTML = `<p class="empty-note">${escapeHtml(
      loadResult.error ||
        "Could not load your library from Firestore. Deploy firestore.rules and try again."
    )}</p>`;
    setSyncStatus(loadResult.error || "Firestore read failed.");
    userSources = [];
    return;
  }

  userSources = mergePersonalSources(
    loadResult.sources || [],
    cached,
    loadRemovedSourceIds(uid)
  );
  saveLibraryCache(uid, userSources);

  const pendingNote = await refreshCacheStatuses(userSources);
  paintList(userSources);
  if (pendingNote) setSyncStatus(pendingNote);
  else if (loadResult.error) setSyncStatus(loadResult.error);
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
  setSyncStatus(`Queuing scrape for your ${userSources.length} source${userSources.length === 1 ? "" : "s"}…`);

  try {
    const idToken = await getIdToken();
    for (const source of userSources) {
      setSyncStatus(`Queuing ${source.name || source.id}…`);
      await triggerScrape({
        sourceId: source.id,
        url: source.url,
        name: source.name,
        idToken,
      });
      cacheStatusById[source.id] = "pending";
    }
    paintList(userSources);
    setSyncStatus(
      "Synced — scrapes are running in the cloud. Home and Daily update when each source finishes."
    );
  } catch (error) {
    setSyncStatus(error.message || "Sync failed.");
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
  setSyncStatus("Saving to your library…");

  try {
    const source = buildSourceFromUrl(url);
    if (!source) throw new Error("Enter a valid URL.");

    unmarkRemovedSourceId(currentUser.uid, source.id);

    // 1) Personal library — Firestore only (no GitHub commit)
    const saved = await addUserSource(currentUser.uid, {
      id: source.id,
      url: source.url,
      name: source.name,
      focus: source.focus,
      blurb: source.blurb,
      custom: true,
    });

    if (!saved.ok) {
      throw new Error(
        saved.error ||
          "Could not save to Firestore. Deploy firestore.rules for users/{uid}/sources."
      );
    }

    const entry = { ...source, _docId: saved.id };
    if (!userSources.some((s) => s.id === entry.id)) {
      userSources.push(entry);
    } else {
      userSources = userSources.map((s) => (s.id === entry.id ? { ...s, ...entry } : s));
    }
    saveLibraryCache(currentUser.uid, userSources);

    // 2) Enqueue cloud scrape (Firestore queue + Actions worker)
    setSyncStatus("Saved. Queuing scrape…");
    let scrapeNote = "";
    try {
      const idToken = await getIdToken();
      const scrapeResult = await triggerScrape({
        sourceId: source.id,
        url: source.url,
        name: source.name,
        idToken,
      });
      cacheStatusById[source.id] = "pending";
      scrapeNote = scrapeSummary(scrapeResult.report || scrapeResult.scrape);
    } catch (scrapeErr) {
      scrapeNote =
        scrapeErr.message ||
        "Saved to your library, but scrape queue failed. Try Sync all.";
    }

    setSyncStatus(`${source.name} saved. ${scrapeNote}`);
    form.reset();
    form.hidden = true;
    paintList(userSources);
  } catch (error) {
    setSyncStatus(error.message || "Could not add source.");
  } finally {
    saveResourceBtn.disabled = false;
    saveResourceBtn.textContent = "Save & scrape";
  }
});

onUserChange(() => renderLibrary().catch(() => {}));

fillNotionForm();
refreshNotionStatus();
setSyncStatus("Library ready. Add links here — Sync scrapes only what you added.");

await renderLibrary();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
