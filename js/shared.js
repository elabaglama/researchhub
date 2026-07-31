const SOURCES_KEY = "research-hub-sources";
const NOTION_KEY = "research-hub-notion";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sourceById(sources, id) {
  return sources.find((source) => source.id === id);
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = normalize(
    [
      item.title,
      item.summary,
      item.type,
      item.deadline,
      ...(item.tags || []),
    ].join(" ")
  );
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(normalize(token)));
}

function loadCustomSources() {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomSources(sources) {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
}

async function loadAllSources() {
  const base = await fetch("data/sources.json").then((r) => r.json());
  const custom = loadCustomSources();
  const seen = new Set(base.map((s) => s.id));
  const merged = [...base];
  for (const source of custom) {
    if (!seen.has(source.id)) {
      merged.push(source);
      seen.add(source.id);
    }
  }
  return merged;
}

function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function getNotionConfig() {
  try {
    const raw = localStorage.getItem(NOTION_KEY);
    if (!raw) return { token: "", databaseId: "" };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || "",
      databaseId: parsed.databaseId || "",
    };
  } catch {
    return { token: "", databaseId: "" };
  }
}

function saveNotionConfig(config) {
  localStorage.setItem(NOTION_KEY, JSON.stringify(config));
}

async function saveOpportunityToNotion(item, sourceName = "") {
  const config = getNotionConfig();
  if (!config.token || !config.databaseId) {
    const token = window.prompt(
      "Paste your Notion integration secret (starts with ntn_ or secret_):",
      config.token || ""
    );
    if (!token) throw new Error("Notion token required");
    const databaseId = window.prompt(
      "Paste your Notion database ID:",
      config.databaseId || ""
    );
    if (!databaseId) throw new Error("Notion database ID required");
    saveNotionConfig({ token: token.trim(), databaseId: databaseId.trim() });
  }

  const latest = getNotionConfig();
  const payload = {
    title: item.title,
    url: item.url,
    deadline: item.deadline || "Open",
    summary: item.summary || "",
    source: sourceName || item.sourceId || "",
    type: item.type || "opportunity",
  };

  // Prefer local/Vercel proxy when available (avoids browser CORS).
  try {
    const proxy = await fetch("/api/save-to-notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ...latest }),
    });
    if (proxy.ok) return await proxy.json();
  } catch {
    /* fall through to direct Notion call */
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${latest.token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: latest.databaseId },
      properties: {
        Name: {
          title: [{ text: { content: payload.title.slice(0, 2000) } }],
        },
        URL: { url: payload.url || null },
        Deadline: {
          rich_text: [{ text: { content: String(payload.deadline).slice(0, 200) } }],
        },
        Source: {
          rich_text: [{ text: { content: String(payload.source).slice(0, 200) } }],
        },
        Type: {
          rich_text: [{ text: { content: String(payload.type).slice(0, 100) } }],
        },
      },
      children: payload.summary
        ? [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  { type: "text", text: { content: payload.summary.slice(0, 1900) } },
                ],
              },
            },
          ]
        : [],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || "Notion save failed");
  }
  return response.json();
}

function renderResultCards(container, items, sources, { carded = false } = {}) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-note">No matches found.</p>`;
    return;
  }

  const itemClass = carded ? "result-card" : "simple-item";

  container.innerHTML = items
    .map((item, index) => {
      const source = sourceById(sources, item.sourceId);
      const sourceName = source?.name || "";
      const deadline = item.deadline
        ? `<span class="deadline">Deadline: ${escapeHtml(item.deadline)}</span>`
        : "";
      return `
        <article class="${itemClass}" data-index="${index}">
          <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <h2 class="simple-title">${escapeHtml(item.title)}</h2>
            <p class="simple-meta">${escapeHtml(sourceName)}${item.type ? ` · ${escapeHtml(item.type)}` : ""}</p>
            ${deadline}
            <p class="simple-summary">${escapeHtml(item.summary)}</p>
          </a>
          <div class="result-actions">
            <a class="result-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open original →</a>
            <button type="button" class="notion-save-btn" data-index="${index}">Save to Notion</button>
          </div>
        </article>`;
    })
    .join("");

  container.querySelectorAll(".notion-save-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const idx = Number(button.dataset.index);
      const item = items[idx];
      if (!item) return;
      const source = sourceById(sources, item.sourceId);
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await saveOpportunityToNotion(item, source?.name || "");
        button.textContent = "Saved";
      } catch (error) {
        console.error(error);
        button.textContent = "Failed";
        window.alert(
          "Could not save to Notion.\n\n1) Create an integration at notion.so/my-integrations\n2) Share your database with that integration\n3) Use property names: Name, URL, Deadline, Source, Type\n\n" +
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

function wirePdfButton() {
  const link = document.getElementById("pdf-link");
  if (!link) return;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.print();
  });
}

export {
  SOURCES_KEY,
  NOTION_KEY,
  normalize,
  escapeHtml,
  sourceById,
  matchesQuery,
  loadCustomSources,
  saveCustomSources,
  loadAllSources,
  slugify,
  getNotionConfig,
  saveNotionConfig,
  saveOpportunityToNotion,
  renderResultCards,
  wirePdfButton,
};
