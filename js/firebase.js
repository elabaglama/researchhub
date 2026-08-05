// Firebase CDN — no bundler needed for this static site.
const FB_VER = "11.0.0";
const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;

const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} = await import(`${CDN}/firebase-auth.js`);
const {
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
} = await import(`${CDN}/firebase-firestore.js`);

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

/** User profile doc ref */
export function userRef(uid) {
  return doc(db, "users", uid);
}

/** User preferences doc ref */
export function prefsRef(uid) {
  return doc(db, "users", uid, "data", "preferences");
}

/** User custom sources collection ref */
export function sourcesRef(uid) {
  return collection(db, "users", uid, "sources");
}

/** Load a user's preferences (returns {} if missing) */
export async function loadUserPrefs(uid) {
  try {
    const snap = await getDoc(prefsRef(uid));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

/** Save (merge) preferences for a user */
export async function saveUserPrefs(uid, data) {
  await setDoc(prefsRef(uid), data, { merge: true });
}

/** Load all user-specific custom sources */
export async function loadUserSources(uid) {
  try {
    const snap = await getDocs(sourcesRef(uid));
    return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/** Add a custom source for a user */
export async function addUserSource(uid, source) {
  const ref = await addDoc(sourcesRef(uid), {
    ...source,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Remove a custom source for a user */
export async function removeUserSource(uid, docId) {
  await deleteDoc(doc(db, "users", uid, "sources", docId));
}
