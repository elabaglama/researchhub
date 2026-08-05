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

// Firestore is optional — if the database hasn't been created in Firebase
// console yet, all Firestore calls will simply fail gracefully.
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

// ── Firestore helpers (all wrapped — failures never break auth) ──────────────

export function userRef(uid) {
  return doc(db, "users", uid);
}

export function prefsRef(uid) {
  return doc(db, "users", uid, "data", "preferences");
}

export function sourcesRef(uid) {
  return collection(db, "users", uid, "sources");
}

export async function loadUserPrefs(uid) {
  try {
    const snap = await getDoc(prefsRef(uid));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

export async function saveUserPrefs(uid, data) {
  try {
    await setDoc(prefsRef(uid), data, { merge: true });
  } catch {
    /* Firestore not yet enabled — ignore */
  }
}

export async function loadUserSources(uid) {
  try {
    const snap = await getDocs(sourcesRef(uid));
    return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function addUserSource(uid, source) {
  try {
    const ref = await addDoc(sourcesRef(uid), {
      ...source,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch {
    return null;
  }
}

export async function removeUserSource(uid, docId) {
  try {
    await deleteDoc(doc(db, "users", uid, "sources", docId));
  } catch {
    /* ignore */
  }
}
