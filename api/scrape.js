/**
 * Authenticated scrape enqueue.
 * Prefers Firestore queue + cache when FIREBASE_SERVICE_ACCOUNT is configured.
 * Falls back to dispatching the Actions worker with url/sourceId only.
 */

import { cors, triggerScrapeWorkflow, slugify, nameFromUrl } from "./_github.js";

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

function hasFirebaseAdmin() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      (process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY)
  );
}

async function enqueueInFirestore(user, sourceId, cacheUrl, name) {
  const { adminDb, FieldValue } = await import("./_firebaseAdmin.js");
  const db = adminDb();
  const cacheRef = db.collection("scrapeCache").doc(sourceId);
  const queueRef = db.collection("scrapeQueue").doc(sourceId);
  const existing = await cacheRef.get();

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
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const url = normalizeUrl(body.url);
    const sourceId = sourceIdFromUrl(url, body.sourceId);
    const name = String(body.name || "").trim() || (url ? nameFromUrl(url) : sourceId);

    if (!url && !sourceId) {
      return res.status(400).json({ error: "url or sourceId required" });
    }

    const cacheUrl = url;
    if (!cacheUrl) {
      return res.status(400).json({ error: "url required for a new source scrape" });
    }

    let user = null;
    let firestoreOk = false;

    if (hasFirebaseAdmin()) {
      try {
        const { verifyIdToken } = await import("./_firebaseAdmin.js");
        user = await verifyIdToken(req);
        await enqueueInFirestore(user, sourceId, cacheUrl, name);
        firestoreOk = true;
      } catch (err) {
        // Auth/Firestore optional for dispatch — still start the worker
        if (err.status === 401) throw err;
        console.warn("Firestore enqueue skipped:", err.message || err);
      }
    }

    let scrape = null;
    try {
      scrape = await triggerScrapeWorkflow({
        sourceId,
        url: cacheUrl,
        name,
        mode: "one",
      });
      if (!firestoreOk) {
        scrape = {
          ...scrape,
          message:
            (scrape.message || "Scrape started.") +
            " (Firestore queue not configured — worker will write the shared opportunities index.)",
        };
      }
    } catch (error) {
      scrape = {
        pending: true,
        message:
          "Could not dispatch the scrape worker. " + (error.message || ""),
      };
    }

    return res.status(200).json({
      ok: true,
      sourceId,
      url: cacheUrl,
      name,
      firestoreQueued: firestoreOk,
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
