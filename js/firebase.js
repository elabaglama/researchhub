// Use static CDN imports — no bundler needed.
// Pinned to 10.12.0, a long-term stable Firebase release on gstatic.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4Yn3cU7QsFQ49Ax3v-iav625_3H3fgJU",
  authDomain: "researchhub-75767.firebaseapp.com",
  projectId: "researchhub-75767",
  storageBucket: "researchhub-75767.firebasestorage.app",
  messagingSenderId: "256055379405",
  appId: "1:256055379405:web:beb6ce713433ed5585b084",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore is required for personal libraries. Failed writes surface to the UI.
export const db = getFirestore(app);

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
};

// ── Firestore helpers ────────────────────────────────────────────────────────

export function userRef(uid) {
  return doc(db, "users", uid);
}

export function prefsRef(uid) {
  return doc(db, "users", uid, "data", "preferences");
}

export function sourcesRef(uid) {
  return collection(db, "users", uid, "sources");
}

export function scrapeCacheRef(sourceId) {
  return doc(db, "scrapeCache", sourceId);
}

function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firestore timeout — check security rules and network.")), ms)
    ),
  ]);
}

function firestoreErrorMessage(err) {
  const code = err?.code || "";
  if (code === "permission-denied") {
    return "Firestore permission denied. Deploy firestore.rules so signed-in users can write users/{uid}/**.";
  }
  return err?.message || "Firestore request failed";
}

export async function loadUserPrefs(uid) {
  try {
    const snap = await withTimeout(getDoc(prefsRef(uid)));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

export async function saveUserPrefs(uid, data) {
  try {
    await withTimeout(setDoc(prefsRef(uid), data, { merge: true }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: firestoreErrorMessage(err) };
  }
}

export async function loadUserSources(uid) {
  try {
    const snap = await withTimeout(getDocs(sourcesRef(uid)));
    return { ok: true, sources: snap.docs.map((d) => ({ _docId: d.id, ...d.data() })) };
  } catch (err) {
    return { ok: false, sources: [], error: firestoreErrorMessage(err) };
  }
}

export async function addUserSource(uid, source) {
  try {
    const ref = await withTimeout(
      addDoc(sourcesRef(uid), { ...source, createdAt: serverTimestamp() })
    );
    return { ok: true, id: ref.id };
  } catch (err) {
    return { ok: false, id: null, error: firestoreErrorMessage(err) };
  }
}

export async function removeUserSource(uid, docId) {
  try {
    await withTimeout(deleteDoc(doc(db, "users", uid, "sources", docId)));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: firestoreErrorMessage(err) };
  }
}

/**
 * Load scrapeCache docs for the given source ids.
 * Returns { ok, caches: { [sourceId]: data }, error? }
 */
export async function loadScrapeCaches(sourceIds) {
  const ids = [...new Set((sourceIds || []).filter(Boolean))];
  if (!ids.length) return { ok: true, caches: {} };

  try {
    const caches = {};
    // Firestore `in` queries support max 30; chunk if needed
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      // Parallel getDoc is simplest and avoids composite index needs
      const snaps = await withTimeout(
        Promise.all(chunk.map((id) => getDoc(scrapeCacheRef(id))))
      );
      for (const snap of snaps) {
        if (snap.exists()) caches[snap.id] = snap.data();
      }
    }
    return { ok: true, caches };
  } catch (err) {
    return { ok: false, caches: {}, error: firestoreErrorMessage(err) };
  }
}

/** Flatten scrapeCache items into an opportunities-like list. */
export function opportunitiesFromCaches(caches, sourceIds) {
  const ids = sourceIds || Object.keys(caches || {});
  const out = [];
  for (const id of ids) {
    const cache = caches?.[id];
    if (!cache || !Array.isArray(cache.items)) continue;
    for (const item of cache.items) {
      out.push({
        ...item,
        sourceId: item.sourceId || id,
      });
    }
  }
  return out;
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return user.getIdToken();
}
