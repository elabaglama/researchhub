async function fetchDatabase(token, databaseId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || data.error || "Could not open Notion database");
    err.details = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function buildProperties(schema, body) {
  const propsMeta = schema.properties || {};
  const titleName =
    Object.keys(propsMeta).find((name) => propsMeta[name]?.type === "title") || "Name";
  const byLower = Object.fromEntries(
    Object.keys(propsMeta).map((name) => [name.toLowerCase(), name])
  );

  function resolve(...candidates) {
    for (const cand of candidates) {
      if (propsMeta[cand]) return cand;
      if (byLower[cand.toLowerCase()]) return byLower[cand.toLowerCase()];
    }
    return null;
  }

  const out = {
    [titleName]: {
      title: [{ text: { content: String(body.title || "Untitled").slice(0, 2000) } }],
    },
  };

  const urlName = resolve("URL", "Link", "Url");
  if (urlName && propsMeta[urlName].type === "url") {
    out[urlName] = { url: body.url || null };
  }

  const deadlineName = resolve("Deadline", "Due", "Date");
  if (deadlineName && propsMeta[deadlineName].type === "rich_text") {
    out[deadlineName] = {
      rich_text: [{ text: { content: String(body.deadline || "Open").slice(0, 200) } }],
    };
  }

  const sourceName = resolve("Source", "Website", "Site");
  if (sourceName && propsMeta[sourceName].type === "rich_text") {
    out[sourceName] = {
      rich_text: [{ text: { content: String(body.source || "").slice(0, 200) } }],
    };
  }

  const typeName = resolve("Type", "Category");
  if (typeName && propsMeta[typeName].type === "rich_text") {
    out[typeName] = {
      rich_text: [
        { text: { content: String(body.type || "opportunity").slice(0, 100) } },
      ],
    };
  }

  return out;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const token = body.token || process.env.NOTION_TOKEN;
    const databaseId = String(body.databaseId || process.env.NOTION_DATABASE_ID || "").replace(
      /-/g,
      ""
    );

    if (!token || !databaseId) {
      return res.status(400).json({
        error: "Missing Notion token or database ID",
      });
    }

    const schema = await fetchDatabase(token, databaseId);

    if (body.testOnly) {
      return res.status(200).json({
        ok: true,
        properties: Object.keys(schema.properties || {}),
      });
    }

    const payload = {
      parent: { database_id: databaseId },
      properties: buildProperties(schema, body),
    };

    if (body.summary) {
      payload.children = [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: String(body.summary).slice(0, 1900) },
              },
            ],
          },
        },
      ];
    }

    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await notionRes.json();
    if (!notionRes.ok) {
      return res.status(notionRes.status).json(data);
    }
    return res.status(200).json({ ok: true, id: data.id });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Server error",
      details: error.details || null,
    });
  }
}
