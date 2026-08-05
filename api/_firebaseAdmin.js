/**
 * Firebase Admin helpers for Vercel serverless APIs.
 * Env: FIREBASE_SERVICE_ACCOUNT — full service-account JSON string
 *   (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    }
    return cert(parsed);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
    return cert({ projectId, clientEmail, privateKey });
  }

  const err = new Error(
    "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT (JSON) in Vercel env."
  );
  err.status = 503;
  throw err;
}

export function initAdmin() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: loadCredential(),
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      "researchhub-75767",
  });
}

export function adminDb() {
  initAdmin();
  return getFirestore();
}

export function adminAuth() {
  initAdmin();
  return getAuth();
}

/** Verify Bearer ID token from Authorization header. Returns decoded token. */
export async function verifyIdToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("Missing Authorization Bearer token. Sign in again.");
    err.status = 401;
    throw err;
  }
  try {
    return await adminAuth().verifyIdToken(match[1].trim());
  } catch {
    const err = new Error("Invalid or expired auth token. Sign in again.");
    err.status = 401;
    throw err;
  }
}

export { FieldValue };
