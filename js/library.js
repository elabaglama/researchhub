import {
  escapeHtml,
  loadAllSources,
  loadCustomSources,
  saveCustomSources,
  slugify,
  wirePdfButton,
  getNotionConfig,
  saveNotionConfig,
  clearNotionConfig,
  isNotionConnected,
} from "./shared.js";

wirePdfButton();

const list = document.getElementById("library-list");
const addBtn = document.getElementById("add-resource-btn");
const form = document.getElementById("add-resource-form");
const cancelBtn = document.getElementById("cancel-add-btn");
const notionForm = document.getElementById("notion-form");
const notionDisconnect = document.getElementById("notion-disconnect-btn");
const notionStatus = document.getElementById("notion-status");
const notionSaveBtn = document.getElementById("notion-save-btn");

function nameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || url;
  } catch {
    return url;
  }
}

function fillNotionForm() {
  const config = getNotionConfig();
  notionForm.querySelector("input[name='token']").value = config.token || "";
  notionForm.querySelector("input[name='databaseId']").value =
    config.databaseId || "c4e56b17d92d40b59aeb00878c6066eb";
}

function refreshNotionStatus(extra = "") {
  if (isNotionConnected()) {
    notionStatus.textContent =
      extra || "Notion connected — Save to Notion is one click on any opportunity.";
  } else {
    notionStatus.textContent =
      extra || "Paste your integration secret once below, then save.";
  }
}

async function renderLibrary() {
  const sources = await loadAllSources();
  const customIds = new Set(loadCustomSources().map((s) => s.id));

  list.innerHTML = sources
    .map((source) => {
      const saved = customIds.has(source.id)
        ? `<span class="saved-tag">Saved</span>`
        : "";
      return `
        <a class="simple-item" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
          <h2 class="simple-title">${escapeHtml(source.name)} ${saved}</h2>
          <p class="simple-meta">${escapeHtml(source.focus || "Resource")}</p>
          <p class="simple-summary">${escapeHtml(source.blurb || source.url)}</p>
        </a>`;
    })
    .join("");
}

addBtn.addEventListener("click", () => {
  form.hidden = false;
  form.querySelector("input[name='url']").focus();
});

cancelBtn.addEventListener("click", () => {
  form.hidden = true;
  form.reset();
});

notionDisconnect.addEventListener("click", () => {
  clearNotionConfig();
  fillNotionForm();
  refreshNotionStatus("Disconnected.");
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const url = String(data.get("url") || "").trim();
  if (!url) return;

  const name = nameFromUrl(url);
  const id = `custom-${slugify(name) || Date.now()}`;
  const custom = loadCustomSources();

  if (custom.some((source) => source.url === url)) {
    form.reset();
    form.hidden = true;
    renderLibrary();
    return;
  }

  custom.push({
    id,
    name,
    url,
    focus: "Saved link",
    blurb: url,
    searchUrl: `${url.replace(/\/$/, "")}/?s={query}`,
  });

  saveCustomSources(custom);
  form.reset();
  form.hidden = true;
  renderLibrary();
});

fillNotionForm();
refreshNotionStatus();
await renderLibrary();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
