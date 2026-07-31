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
    const databaseId = body.databaseId || process.env.NOTION_DATABASE_ID;

    if (!token || !databaseId) {
      return res.status(400).json({
        error: "Missing Notion token or database ID",
      });
    }

    const payload = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: String(body.title || "Untitled").slice(0, 2000) } }],
        },
        URL: { url: body.url || null },
        Deadline: {
          rich_text: [{ text: { content: String(body.deadline || "Open").slice(0, 200) } }],
        },
        Source: {
          rich_text: [{ text: { content: String(body.source || "").slice(0, 200) } }],
        },
        Type: {
          rich_text: [{ text: { content: String(body.type || "opportunity").slice(0, 100) } }],
        },
      },
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
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
