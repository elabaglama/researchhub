import {
  cors,
  readJsonFile,
  putFile,
  triggerScrapeWorkflow,
  slugify,
  nameFromUrl,
} from "./_github.js";

function normalizeUrl(url) {
  let value = String(url || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const sources = await readJsonFile("data/custom-sources.json", []);
      return res.status(200).json({ sources });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const url = normalizeUrl(body.url);
      if (!url) return res.status(400).json({ error: "url required" });

      const custom = await readJsonFile("data/custom-sources.json", []);
      const existing = custom.find((s) => s.url === url);
      if (existing) {
        const scrape =
          body.scrape === false
            ? null
            : await triggerScrapeWorkflow({ sourceId: existing.id });
        return res.status(200).json({
          ok: true,
          created: false,
          source: existing,
          scrape,
        });
      }

      const base = await readJsonFile("data/sources.json", []);
      const name = String(body.name || "").trim() || nameFromUrl(url);
      let id = String(body.id || `custom-${slugify(name) || "source"}`).trim();
      const used = new Set([
        ...base.map((s) => s.id),
        ...custom.map((s) => s.id),
      ]);
      if (used.has(id)) id = `${id}-${custom.length + 1}`;

      const source = {
        id,
        name,
        url,
        focus: body.focus || "Saved link",
        blurb: body.blurb || url,
        searchUrl: `${url.replace(/\/$/, "")}/?s={query}`,
        custom: true,
      };
      if (url.includes("airtable.com")) source.airtableUrl = url;

      const next = [...custom, source];
      // Committing this file triggers the scrape workflow immediately via push paths.
      await putFile(
        "data/custom-sources.json",
        `${JSON.stringify(next, null, 2)}\n`,
        `chore: add library source ${source.name}`
      );

      // Belt-and-suspenders: also dispatch an explicit scrape for this source.
      let scrape = null;
      if (body.scrape !== false) {
        try {
          scrape = await triggerScrapeWorkflow({ sourceId: id });
        } catch (error) {
          // Push-path trigger may still run even if Actions dispatch fails.
          scrape = {
            pending: true,
            message:
              "Source saved. Cloud scrape should start from the library file update. " +
              (error.message || ""),
          };
        }
      }

      return res.status(201).json({
        ok: true,
        created: true,
        source,
        scrape,
      });
    }

    if (req.method === "DELETE") {
      // /api/sources?id=custom-foo  or body.id
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const queryId = req.query?.id;
      const sourceId = String(queryId || body.id || "").trim();
      if (!sourceId) return res.status(400).json({ error: "id required" });

      const custom = await readJsonFile("data/custom-sources.json", []);
      const next = custom.filter((s) => s.id !== sourceId);
      await putFile(
        "data/custom-sources.json",
        `${JSON.stringify(next, null, 2)}\n`,
        `chore: remove library source ${sourceId}`
      );

      const scrape = await triggerScrapeWorkflow({ removeSourceId: sourceId });
      return res.status(200).json({
        ok: true,
        removed: sourceId,
        remaining: next.length,
        scrape,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Server error",
      details: error.details || null,
    });
  }
}
