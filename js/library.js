import { escapeHtml, wirePdfButton } from "./shared.js";

wirePdfButton();

const list = document.getElementById("library-list");
const sources = await fetch("data/sources.json").then((r) => r.json());

list.innerHTML = sources
  .map(
    (source) => `
      <a class="simple-item" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
        <h2 class="simple-title">${escapeHtml(source.name)}</h2>
        <p class="simple-meta">${escapeHtml(source.focus)}</p>
        <p class="simple-summary">${escapeHtml(source.blurb)}</p>
      </a>`
  )
  .join("");

if (new URLSearchParams(window.location.search).get("print") === "1") {
  window.addEventListener("load", () => window.print());
}
