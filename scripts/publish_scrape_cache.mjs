#!/usr/bin/env node
/**
 * Publish scrape results to Firestore scrapeCache and clear scrapeQueue.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT — service account JSON string
 *
 * Usage:
 *   node scripts/publish_scrape_cache.mjs --report /tmp/scrape-report.json
 *   node scripts/publish_scrape_cache.mjs --list-queue   # print queue JSON to stdout
 *   node scripts/publish_scrape_cache.mjs --refresh-all  # print all cache URLs as JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is required");
  }
  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  }
  return cert(parsed);
}

function db() {
  if (!getApps().length) {
    initializeApp({
      credential: loadCredential(),
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}").project_id ||
        "researchhub-75767",
    });
  }
  return getFirestore();
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

async function listQueue() {
  const snap = await db().collection("scrapeQueue").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(items, null, 2));
  return items;
}

async function listCache() {
  const snap = await db().collection("scrapeCache").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(JSON.stringify(items, null, 2));
  return items;
}

const OLD_YEAR_RE = /(?<!\d)(?:20(?:0\d|1\d|2[0-5]))(?!\d)/;

function isCurrentYearItem(item) {
  const blob = [
    item?.url,
    item?.title,
    item?.summary,
    item?.deadline,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ]
    .filter(Boolean)
    .join(" ");
  return !OLD_YEAR_RE.test(blob);
}

async function publishReport(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const fresh = report.freshBySource || {};
  const sourcesMeta = report.sources || {};
  const firestore = db();
  const ids = Object.keys(fresh).length
    ? Object.keys(fresh)
    : Object.keys(sourcesMeta);

  for (const sourceId of ids) {
    const items = (fresh[sourceId] || []).filter(isCurrentYearItem);
    const meta = sourcesMeta[sourceId] || {};
    const status = meta.ok === false ? "error" : "ready";
    const ref = firestore.collection("scrapeCache").doc(sourceId);
    const existing = await ref.get();
    const prev = existing.exists ? existing.data() : {};

    await ref.set(
      {
        sourceId,
        url: prev.url || "",
        name: prev.name || sourceId,
        items,
        status,
        count: items.length,
        error: meta.error || null,
        scrapedAt: report.scrapedAt || new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await firestore.collection("scrapeQueue").doc(sourceId).delete().catch(() => {});
    console.log(`[publish] ${sourceId}: ${items.length} items (${status})`);
  }
}

async function main() {
  if (process.argv.includes("--list-queue")) {
    await listQueue();
    return;
  }
  if (process.argv.includes("--list-cache") || process.argv.includes("--refresh-all")) {
    await listCache();
    return;
  }

  const reportPath = argValue("--report");
  if (!reportPath) {
    console.error("Usage: --report <path> | --list-queue | --list-cache");
    process.exit(1);
  }
  await publishReport(reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
