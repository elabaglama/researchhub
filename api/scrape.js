/**
 * Authenticated scrape enqueue.
 * - Verifies Firebase ID token
 * - Writes scrapeQueue + scrapeCache stub in Firestore
 * - Dispatches GitHub Actions worker (no git commits of custom-sources)
 */

import { cors, triggerScrapeWorkflow, slugify, nameFromUrl } from "./_github.js";
import { verifyIdToken, adminDb, FieldValue } from "./_firebaseAdmin.js";

function normalizeUrl(url) {
  let value = String(url || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function sourceIdFromUrl(url, explicitId) {
  if (explicitId) return String(explicitId).trim();
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `custom-${slugify(host) || "source"}`;
  } catch {
    return `custom-${slugify(url) || "source"}`;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await verifyIdToken(req);
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const url = normalizeUrl(body.url);
    const sourceId = sourceIdFromUrl(url, body.sourceId);
    const name = String(body.name || "").trim() || (url ? nameFromUrl(url) : sourceId);

    if (!url && !sourceId) {
      return res.status(400).json({ error: "url or sourceId required" });
    }

    const db = adminDb();
    const cacheRef = db.collection("scrapeCache").doc(sourceId);
    const queueRef = db.collection("scrapeQueue").doc(sourceId);

    const existing = await cacheRef.get();
    const cacheUrl = url || existing.data()?.url || "";
    if (!cacheUrl) {
      return res.status(400).json({ error: "url required for a new source scrape" });
    }

    await cacheRef.set(
      {
        sourceId,
        url: cacheUrl,
        name: name || existing.data()?.name || nameFromUrl(cacheUrl),
        status: "pending",
        updatedAt: FieldValue.serverTimestamp(),
        requestedBy: user.uid,
        ...(existing.exists ? {} : { items: [], createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    await queueRef.set({
      sourceId,
      url: cacheUrl,
      name: name || nameFromUrl(cacheUrl),
      requestedAt: FieldValue.serverTimestamp(),
      requestedBy: user.uid,
    });

    let scrape = null;
    try {
      scrape = await triggerScrapeWorkflow({
        sourceId,
        url: cacheUrl,
        name,
        mode: "one",
      });
    } catch (error) {
      scrape = {
        pending: true,
        message:
          "Queued in Firestore. Cloud worker dispatch failed — it will retry on the next schedule. " +
          (error.message || ""),
      };
    }

    return res.status(200).json({
      ok: true,
      sourceId,
      url: cacheUrl,
      name,
      report: scrape,
      scrape,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Could not start scrape",
      details: error.details || null,
    });
  }
}
