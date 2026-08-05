import { cors, triggerScrapeWorkflow } from "./_github.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const scrape = await triggerScrapeWorkflow({
      url: body.url || "",
      sourceId: body.sourceId || "",
      removeSourceId: body.removeSourceId || "",
    });
    return res.status(200).json({ ok: true, report: scrape, scrape });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Could not start cloud scrape",
      details: error.details || null,
    });
  }
}
