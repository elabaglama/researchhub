import {
  escapeHtml,
  wireXlsButton,
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
} from "./shared.js?v=20260806b";
import {
  currentUser,
  onUserChange,
  persistNotionToFirestore,
} from "./auth.js?v=20260806b";
import {
  loadUserSources,
  addUserSource,
  removeUserSource,
  getIdToken,
  loadScrapeCaches,
  publishSharedLibrary,
  loadSharedLibrary,
} from "./firebase.js?v=20260806b";
import { t, initI18n, toggleLang } from "./i18n.js?v=20260806b";

initI18n();

wireXlsButton(() => ({
  items: userSources.map((s) => ({
    title: s.name || s.id,
    type: "source",
    deadline: "",
    sourceId: s.id,
    url: s.url,
    summary: s.blurb || s.focus || "",
  })),
  sources: userSources,
  filenamePrefix: "libreria-research-hub",
}));

document.getElementById("lang-toggle-btn")?.addEventListener("click", () => {
  toggleLang();
  paintList(userSources);
  refreshNotionStatus();
});
window.addEventListener("langchange", () => {
  paintList(userSources);
  refreshNotionStatus();
});

const list = document.getElementById("library-list");
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

const shareBtn = document.getElementById("share-library-btn");
const shareOverlay = document.getElementById("share-overlay");
const shareCloseBtn = document.getElementById("share-close-btn");
const shareUrlInput = document.getElementById("share-url-input");
const shareStatus = document.getElementById("share-status");
const shareCopyBtn = document.getElementById("share-copy-btn");

const importOverlay = document.getElementById("import-overlay");
const importCloseBtn = document.getElementById("import-close-btn");
const importStatus = document.getElementById("import-status");
const importConfirmBtn = document.getElementById("import-confirm-btn");

const bulkImportToggle = document.getElementById("bulk-import-toggle");
const bulkImportPanel = document.getElementById("bulk-import-panel");
const bulkUrls = document.getElementById("bulk-urls");
const bulkAddBtn = document.getElementById("bulk-add-btn");

let userSources = [];
let cacheStatusById = {};
let pendingImport = null;

function openOverlay(el) {
  if (!el) return;
  el.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeOverlay(el) {
  if (!el) return;
  el.hidden = true;
  document.body.style.overflow = "";
}

function openNotionPopup() {
  openOverlay(notionOverlay);
  notionForm.querySelector("input[name='token']").focus();
}
function closeNotionPopup() {
  closeOverlay(notionOverlay);
}

notionToggleBtn?.addEventListener("click", openNotionPopup);
notionCloseBtn?.addEventListener("click", closeNotionPopup);
notionOverlay?.addEventListener("click", (e) => {
  if (e.target === notionOverlay) closeNotionPopup();
});
shareCloseBtn?.addEventListener("click", () => closeOverlay(shareOverlay));
shareOverlay?.addEventListener("click", (e) => {
  if (e.target === shareOverlay) closeOverlay(shareOverlay);
});
importCloseBtn?.addEventListener("click", () => closeOverlay(importOverlay));
importOverlay?.addEventListener("click", (e) => {
  if (e.target === importOverlay) closeOverlay(importOverlay);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!notionOverlay?.hidden) closeNotionPopup();
  if (!shareOverlay?.hidden) closeOverlay(shareOverlay);
  if (!importOverlay?.hidden) closeOverlay(importOverlay);
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
    notionStatus.textContent = extra || "Notion ✓";
    notionToggleBtn.textContent = t("notion.connected");
  } else {
    notionStatus.textContent = extra || "";
    notionToggleBtn.textContent = t("notion.connect");
  }
}

function setSyncStatus(message) {
  syncStatus.textContent = message || "";
}

function scrapeSummary(report) {
  if (!report) return "";
  if (report.pending) {
    return report.message || "…";
  }
  return report.message || "";
}

function statusLabel(sourceId) {
  const status = cacheStatusById[sourceId];
  if (status === "pending") return ` <span class="saved-tag">${t("lib.statusScraping")}</span>`;
  if (status === "error") return ` <span class="saved-tag">${t("lib.statusFailed")}</span>`;
  if (status === "ready") return ` <span class="saved-tag">${t("lib.statusReady")}</span>`;
  return ` <span class="saved-tag">${t("lib.statusLibrary")}</span>`;
}

function paintList(sources) {
  if (!sources.length) {
    list.innerHTML = `<p class="empty-note">${t("lib.empty")}</p>`;
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
            <button type="button" class="notion-save-btn resync-btn" data-id="${escapeHtml(source.id)}">${t("lib.rescrape")}</button>
            <button type="button" class="notion-save-btn remove-btn" data-id="${escapeHtml(source.id)}">${t("lib.remove")}</button>
          </div>
        </article>`;
    })
    .join("");

  list.querySelectorAll(".resync-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const source = userSources.find((s) => s.id === id);
      button.disabled = true;
      button.textContent = t("lib.statusScraping");
      setSyncStatus(`${source?.name || id}…`);
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
        setSyncStatus(error.message || t("lib.statusFailed"));
      } finally {
        button.disabled = false;
        button.textContent = t("lib.rescrape");
      }
    });
  });

  list.querySelectorAll(".remove-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      if (!window.confirm(t("lib.confirmRemove"))) return;
      if (!currentUser) return;

      const us = userSources.find((s) => s.id === id);
      const card = button.closest("article");
      button.disabled = true;

      markRemovedSourceId(currentUser.uid, id);
      userSources = userSources.filter((s) => s.id !== id);
      saveLibraryCache(currentUser.uid, userSources);
      if (card) card.remove();
      if (!userSources.length) paintList([]);
      setSyncStatus(t("lib.removing"));

      if (us?._docId) {
        const result = await removeUserSource(currentUser.uid, us._docId);
        if (!result.ok) {
          setSyncStatus(result.error || "Cloud delete failed.");
          return;
        }
      }
      setSyncStatus(t("lib.removed"));
    });
  });
}

async function refreshCacheStatuses(sources) {
  const ids = sources.map((s) => s.id);
  const { ok, caches, error } = await loadScrapeCaches(ids);
  cacheStatusById = {};
  if (!ok) return error || null;
  let pending = 0;
  for (const id of ids) {
    const status = caches[id]?.status || (caches[id]?.items?.length ? "ready" : "");
    if (status) cacheStatusById[id] = status;
    if (status === "pending") pending += 1;
  }
  if (pending) return `${pending}…`;
  return null;
}

async function renderLibrary() {
  if (!currentUser) {
    list.innerHTML = `<p class="empty-note">${t("lib.signIn")}</p>`;
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
      loadResult.error || "Firestore error."
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
  if (loadResult.error) setSyncStatus(loadResult.error);
  else if (!pendingNote) setSyncStatus("");
  // pending scrapes no longer show a cryptic "N…" under the title
}

async function addOneSource(url, { scrape = true } = {}) {
  const source = buildSourceFromUrl(url);
  if (!source) throw new Error("URL non valido.");
  unmarkRemovedSourceId(currentUser.uid, source.id);

  const saved = await addUserSource(currentUser.uid, {
    id: source.id,
    url: source.url,
    name: source.name,
    focus: source.focus,
    blurb: source.blurb,
    custom: true,
  });
  if (!saved.ok) throw new Error(saved.error || "Firestore save failed.");

  const entry = { ...source, _docId: saved.id };
  if (!userSources.some((s) => s.id === entry.id)) {
    userSources.push(entry);
  } else {
    userSources = userSources.map((s) => (s.id === entry.id ? { ...s, ...entry } : s));
  }
  saveLibraryCache(currentUser.uid, userSources);

  if (scrape) {
    try {
      const idToken = await getIdToken();
      await triggerScrape({
        sourceId: source.id,
        url: source.url,
        name: source.name,
        idToken,
      });
      cacheStatusById[source.id] = "pending";
    } catch {
      /* keep going */
    }
  }
  return source;
}

cancelBtn?.addEventListener("click", () => {
  form.reset();
});

syncAllBtn.addEventListener("click", async () => {
  if (!currentUser) {
    setSyncStatus(t("lib.signIn"));
    return;
  }
  if (!userSources.length) {
    setSyncStatus(t("lib.empty"));
    return;
  }

  syncAllBtn.disabled = true;
  syncAllBtn.textContent = "…";
  setSyncStatus(`… ${userSources.length}`);

  try {
    const idToken = await getIdToken();
    for (const source of userSources) {
      setSyncStatus(`${source.name || source.id}…`);
      await triggerScrape({
        sourceId: source.id,
        url: source.url,
        name: source.name,
        idToken,
      });
      cacheStatusById[source.id] = "pending";
    }
    paintList(userSources);
    setSyncStatus(t("lib.syncReady"));
  } catch (error) {
    setSyncStatus(error.message || "Sync failed.");
  } finally {
    syncAllBtn.disabled = false;
    syncAllBtn.textContent = t("lib.syncAll");
  }
});

// ── Share library ────────────────────────────────────────────────────────────
shareBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    setSyncStatus(t("lib.signIn"));
    return;
  }
  if (!userSources.length) {
    setSyncStatus(t("lib.empty"));
    return;
  }
  shareBtn.disabled = true;
  shareStatus.textContent = "…";
  openOverlay(shareOverlay);
  const result = await publishSharedLibrary(currentUser.uid, userSources, {
    name: currentUser.displayName || "Research Hub",
  });
  shareBtn.disabled = false;
  if (!result.ok) {
    shareStatus.textContent = result.error || "Share failed.";
    return;
  }
  shareUrlInput.value = result.url;
  shareStatus.textContent = t("lib.shareCopied");
  try {
    await navigator.clipboard.writeText(result.url);
  } catch {
    /* user can copy manually */
  }
});

shareCopyBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    shareStatus.textContent = t("lib.shareCopied");
  } catch {
    shareUrlInput.select();
  }
});

// ── Import shared library via ?import=CODE ───────────────────────────────────
async function maybeOfferImport() {
  const code = new URLSearchParams(location.search).get("import");
  if (!code) return;
  const { ok, library, error } = await loadSharedLibrary(code);
  if (!ok || !library) {
    setSyncStatus(error || "Share code not found.");
    return;
  }
  pendingImport = library;
  importStatus.textContent = t("lib.importConfirm", {
    n: (library.sources || []).length,
  });
  openOverlay(importOverlay);
}

importConfirmBtn?.addEventListener("click", async () => {
  if (!pendingImport || !currentUser) {
    setSyncStatus(t("lib.signIn"));
    return;
  }
  importConfirmBtn.disabled = true;
  const sources = pendingImport.sources || [];
  let added = 0;
  for (const s of sources) {
    try {
      if (userSources.some((u) => u.id === s.id || u.url === s.url)) continue;
      await addOneSource(s.url, { scrape: true });
      added += 1;
    } catch {
      /* continue */
    }
  }
  importConfirmBtn.disabled = false;
  closeOverlay(importOverlay);
  paintList(userSources);
  setSyncStatus(`${t("lib.importDone")} (+${added})`);
  // Clean URL
  const url = new URL(location.href);
  url.searchParams.delete("import");
  history.replaceState({}, "", url);
  pendingImport = null;
});

// ── Bulk import ──────────────────────────────────────────────────────────────
bulkImportToggle?.addEventListener("click", () => {
  if (!bulkImportPanel) return;
  const open = bulkImportPanel.hidden;
  bulkImportPanel.hidden = !open;
  if (open) bulkUrls?.focus();
});

bulkAddBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    setSyncStatus(t("lib.signIn"));
    return;
  }
  const lines = String(bulkUrls.value || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return;

  bulkAddBtn.disabled = true;
  let added = 0;
  for (const line of lines) {
    try {
      setSyncStatus(`${line}…`);
      await addOneSource(line, { scrape: true });
      added += 1;
    } catch (err) {
      setSyncStatus(err.message || line);
    }
  }
  bulkAddBtn.disabled = false;
  bulkUrls.value = "";
  if (bulkImportPanel) bulkImportPanel.hidden = true;
  paintList(userSources);
  setSyncStatus(`+${added}`);
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
  notionSaveBtn.textContent = "…";

  if (currentUser) {
    persistNotionToFirestore(currentUser.uid, { token, databaseId }).catch(() => {});
  }

  try {
    const response = await fetch(
      `${window.__APP_BASE__ || ""}/api/test-notion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, databaseId }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Notion test failed");
    }
    refreshNotionStatus("Notion ✓");
  } catch (error) {
    refreshNotionStatus(error.message || "Notion test failed");
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
    setSyncStatus(t("lib.signIn"));
    return;
  }

  saveResourceBtn.disabled = true;
  saveResourceBtn.textContent = t("lib.saving");
  setSyncStatus(t("lib.saving"));

  try {
    const source = await addOneSource(url, { scrape: true });
    setSyncStatus(`${source.name} ${t("lib.saved")}`);
    form.reset();
    paintList(userSources);
  } catch (error) {
    setSyncStatus(error.message || "Error");
  } finally {
    saveResourceBtn.disabled = false;
    saveResourceBtn.textContent = t("lib.saveBtn");
  }
});

onUserChange(() => renderLibrary().catch(() => {}));

fillNotionForm();
refreshNotionStatus();

await renderLibrary();
await maybeOfferImport();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
