import {
  escapeHtml,
  loadAllSources,
  loadCustomSources,
  saveCustomSources,
  slugify,
  wirePdfButton,
} from "./shared.js";

wirePdfButton();

const list = document.getElementById("library-list");
const addBtn = document.getElementById("add-resource-btn");
const form = document.getElementById("add-resource-form");
const cancelBtn = document.getElementById("cancel-add-btn");

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
          <p class="simple-meta">${escapeHtml(source.focus || "General")}</p>
          <p class="simple-summary">${escapeHtml(source.blurb || source.url)}</p>
        </a>`;
    })
    .join("");
}

addBtn.addEventListener("click", () => {
  form.hidden = false;
  form.querySelector("input[name='name']").focus();
});

cancelBtn.addEventListener("click", () => {
  form.hidden = true;
  form.reset();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const url = String(data.get("url") || "").trim();
  if (!name || !url) return;

  const id = `custom-${slugify(name) || Date.now()}`;
  const searchUrl = String(data.get("searchUrl") || "").trim();
  const custom = loadCustomSources();

  custom.push({
    id,
    name,
    url,
    focus: String(data.get("focus") || "Custom source").trim() || "Custom source",
    blurb: String(data.get("blurb") || "").trim() || `Saved resource: ${name}`,
    searchUrl: searchUrl || `${url.replace(/\/$/, "")}/?s={query}`,
  });

  saveCustomSources(custom);
  form.reset();
  form.hidden = true;
  renderLibrary();
});

await renderLibrary();

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
