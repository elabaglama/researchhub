/**
 * Source metadata helper — no GitHub commits.
 * Personal libraries live in Firestore (users/{uid}/sources).
 * POST returns a normalized source object and can enqueue a scrape.
 */

import { cors, slugify, nameFromUrl, triggerScrapeWorkflow } from "./_github.js";
import { verifyIdToken, adminDb, FieldValue } from "./_firebaseAdmin.js";

function normalizeUrl(url) {
  let value = String(url || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function buildSource(url, body = {}) {
  const name = String(body.name || "").trim() || nameFromUrl(url);
  let id = String(body.id || `custom-${slugify(name) || "source"}`).trim();
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
  return source;
}

async function enqueueScrape(user, source) {
  const db = adminDb();
  const cacheRef = db.collection("scrapeCache").doc(source.id);
  const queueRef = db.collection("scrapeQueue").doc(source.id);

  await cacheRef.set(
    {
      sourceId: source.id,
      url: source.url,
      name: source.name,
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
      requestedBy: user.uid,
      items: [],
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await queueRef.set({
    sourceId: source.id,
    url: source.url,
    name: source.name,
    requestedAt: FieldValue.serverTimestamp(),
    requestedBy: user.uid,
  });

  try {
    return await triggerScrapeWorkflow({
      sourceId: source.id,
      url: source.url,
      name: source.name,
      mode: "one",
    });
  } catch (error) {
    return {
      pending: true,
      message:
        "Queued in Firestore. Worker dispatch failed — next schedule will pick it up. " +
        (error.message || ""),
    };
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      // Legacy endpoint — personal libraries are in Firestore, not a shared file.
      return res.status(200).json({ sources: [], deprecated: true });
    }

    if (req.method === "POST") {
      const user = await verifyIdToken(req);
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const url = normalizeUrl(body.url);
      if (!url) return res.status(400).json({ error: "url required" });

      const source = buildSource(url, body);
      let scrape = null;
      if (body.scrape !== false) {
        scrape = await enqueueScrape(user, source);
      }

      return res.status(201).json({
        ok: true,
        created: true,
        source,
        scrape,
      });
    }

    if (req.method === "DELETE") {
      // Personal remove is handled in Firestore by the client. No shared-file delete.
      await verifyIdToken(req);
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const sourceId = String(req.query?.id || body.id || "").trim();
      return res.status(200).json({
        ok: true,
        removed: sourceId || null,
        note: "Personal library entries are removed in Firestore only.",
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
