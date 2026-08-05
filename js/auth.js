import {
  auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  userRef,
  loadUserPrefs,
  saveUserPrefs,
  setDoc,
} from "./firebase.js";
import { saveNotionConfig } from "./shared.js";
import { showOnboardingIfNeeded } from "./onboarding.js";

// ── Public state ─────────────────────────────────────────────────────────────
export let currentUser = null;

const _listeners = new Set();
export function onUserChange(fn) {
  _listeners.add(fn);
  fn(currentUser); // call immediately with current state
  return () => _listeners.delete(fn);
}
function _notify() {
  _listeners.forEach((fn) => fn(currentUser));
}

// ── Sync Notion config between Firestore and localStorage ───────────────────
async function syncNotionFromFirestore(uid) {
  try {
    const prefs = await loadUserPrefs(uid);
    if (prefs.notionToken && prefs.notionDatabaseId) {
      saveNotionConfig({ token: prefs.notionToken, databaseId: prefs.notionDatabaseId });
    }
  } catch {
    /* keep localStorage values */
  }
}

export async function persistNotionToFirestore(uid, config) {
  if (!uid) return;
  await saveUserPrefs(uid, {
    notionToken: config.token || "",
    notionDatabaseId: config.databaseId || "",
  });
}

// ── Auth gate ────────────────────────────────────────────────────────────────
function _applyGate(user) {
  const body = document.body;
  if (!user) {
    body.classList.add("auth-gated");
    _renderGate();
  } else {
    body.classList.remove("auth-gated");
    const gate = document.getElementById("auth-gate");
    if (gate) {
      gate.classList.add("auth-gate--leaving");
      setTimeout(() => gate.remove(), 350);
    }
    // Sign-in counts as a user gesture — tell the player it can start audio.
    window.dispatchEvent(new CustomEvent("hub:signed-in"));
  }
}

function _renderGate() {
  if (document.getElementById("auth-gate")) return;
  const gate = document.createElement("div");
  gate.id = "auth-gate";
  gate.className = "auth-gate";
  gate.innerHTML = `
    <div class="auth-gate-card">
      <p class="auth-gate-brand">Research<br/>Hub</p>
      <h1 class="auth-gate-title">Your personal opportunity feed</h1>
      <p class="auth-gate-sub">Sign in to access your daily report, search, and library.</p>
      <p class="auth-gate-error" id="gate-error" hidden></p>
      <button class="auth-google-btn auth-gate-google" id="gate-google-btn" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.2 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Continue with Google
      </button>
      <div class="auth-divider"><span>or</span></div>
      <form class="auth-form" id="gate-form">
        <div id="gate-name-wrap" hidden>
          <input class="auth-input" name="name" type="text" placeholder="Your name" autocomplete="name" />
        </div>
        <input class="auth-input" name="email" type="email" placeholder="Email" required autocomplete="email" />
        <input class="auth-input" name="password" type="password" placeholder="Password" required minlength="6" autocomplete="current-password" />
        <button class="auth-submit-btn" type="submit" id="gate-submit-btn">Sign in</button>
      </form>
      <div class="auth-footer" style="margin-top:.25rem">
        <button class="auth-link-btn" id="gate-toggle-btn">No account? Sign up</button>
        <button class="auth-link-btn" id="gate-forgot-btn">Forgot password?</button>
      </div>
    </div>
  `;
  document.body.appendChild(gate);

  let mode = "signin";
  const errorEl = gate.querySelector("#gate-error");
  const googleBtn = gate.querySelector("#gate-google-btn");
  const form = gate.querySelector("#gate-form");
  const submitBtn = gate.querySelector("#gate-submit-btn");
  const toggleBtn = gate.querySelector("#gate-toggle-btn");
  const forgotBtn = gate.querySelector("#gate-forgot-btn");
  const nameWrap = gate.querySelector("#gate-name-wrap");

  function showErr(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function clearErr() { errorEl.hidden = true; }

  googleBtn.addEventListener("click", async () => {
    clearErr(); googleBtn.disabled = true;
    try { await signInGoogle(); }
    catch (err) { showErr(friendlyError(err)); googleBtn.disabled = false; }
  });

  toggleBtn.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    toggleBtn.textContent = mode === "signup" ? "Have an account? Sign in" : "No account? Sign up";
    nameWrap.hidden = mode !== "signup";
    clearErr();
  });

  forgotBtn.addEventListener("click", async () => {
    clearErr();
    const email = form.querySelector("[name='email']").value.trim();
    if (!email) { showErr("Enter your email first."); return; }
    try { await resetPassword(email); showErr("Reset link sent — check your inbox."); }
    catch (err) { showErr(friendlyError(err)); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErr();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    submitBtn.disabled = true;
    try {
      if (mode === "signup") await signUpEmail(email, password, name);
      else await signInEmail(email, password);
    } catch (err) {
      showErr(friendlyError(err));
      submitBtn.disabled = false;
    }
  });
}

// ── Auth state observer ──────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  // Update UI immediately — never block on Firestore.
  _notify();
  _applyGate(user);
  _renderAllAuthRoots();

  // Firestore sync runs in the background; failures are silently ignored.
  if (user) {
    setDoc(
      userRef(user.uid),
      { name: user.displayName || "", email: user.email || "", photoURL: user.photoURL || "" },
      { merge: true }
    ).catch(() => {});

    syncNotionFromFirestore(user.uid).catch(() => {});

    // Show onboarding guide to first-time users (silently skips if already seen)
    showOnboardingIfNeeded(user).catch(() => {});
  }
});

// ── Auth actions ─────────────────────────────────────────────────────────────
async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

async function signInEmail(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

async function signUpEmail(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
}

async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

async function doSignOut() {
  await signOut(auth);
}

// ── Modal HTML ───────────────────────────────────────────────────────────────
function buildModal() {
  if (document.getElementById("auth-modal")) return;

  const overlay = document.createElement("div");
  overlay.id = "auth-modal";
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-popup" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div class="auth-popup-head">
        <h2 id="auth-modal-title" class="auth-popup-title">Sign in</h2>
        <button class="notion-close-btn" id="auth-close-btn" aria-label="Close">✕</button>
      </div>

      <p class="auth-error" id="auth-error" hidden></p>

      <button class="auth-google-btn" id="auth-google-btn" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.2 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Continue with Google
      </button>

      <div class="auth-divider"><span>or</span></div>

      <form id="auth-email-form" class="auth-form">
        <div id="auth-name-wrap" hidden>
          <input class="auth-input" name="name" type="text" placeholder="Your name" autocomplete="name" />
        </div>
        <input class="auth-input" name="email" type="email" placeholder="Email" required autocomplete="email" />
        <input class="auth-input" name="password" type="password" placeholder="Password" required autocomplete="current-password" minlength="6" />
        <button class="auth-submit-btn" type="submit" id="auth-submit-btn">Sign in</button>
      </form>

      <div class="auth-footer">
        <button class="auth-link-btn" id="auth-toggle-mode">No account? Sign up</button>
        <button class="auth-link-btn" id="auth-forgot-btn">Forgot password?</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let mode = "signin"; // "signin" | "signup"

  const modal = document.getElementById("auth-modal");
  const errorEl = document.getElementById("auth-error");
  const googleBtn = document.getElementById("auth-google-btn");
  const emailForm = document.getElementById("auth-email-form");
  const submitBtn = document.getElementById("auth-submit-btn");
  const toggleBtn = document.getElementById("auth-toggle-mode");
  const forgotBtn = document.getElementById("auth-forgot-btn");
  const nameWrap = document.getElementById("auth-name-wrap");
  const titleEl = document.getElementById("auth-modal-title");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  document.getElementById("auth-close-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  googleBtn.addEventListener("click", async () => {
    clearError();
    googleBtn.disabled = true;
    try {
      await signInGoogle();
      closeModal();
    } catch (err) {
      showError(friendlyError(err));
    } finally {
      googleBtn.disabled = false;
    }
  });

  toggleBtn.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    titleEl.textContent = mode === "signup" ? "Create account" : "Sign in";
    submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    toggleBtn.textContent = mode === "signup" ? "Have an account? Sign in" : "No account? Sign up";
    nameWrap.hidden = mode !== "signup";
    clearError();
  });

  forgotBtn.addEventListener("click", async () => {
    clearError();
    const email = emailForm.querySelector("[name='email']").value.trim();
    if (!email) { showError("Enter your email first."); return; }
    try {
      await resetPassword(email);
      showError("Reset link sent — check your inbox.");
    } catch (err) {
      showError(friendlyError(err));
    }
  });

  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const fd = new FormData(emailForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "").trim();
    submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        await signUpEmail(email, password, name);
      } else {
        await signInEmail(email, password);
      }
      closeModal();
    } catch (err) {
      showError(friendlyError(err));
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openModal() {
  buildModal();
  const modal = document.getElementById("auth-modal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  modal.querySelector(".auth-input")?.focus();
}

function closeModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.hidden = true;
  document.body.style.overflow = "";
}

function friendlyError(err) {
  const code = err?.code || "";
  if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential")
    return "Incorrect email or password.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/popup-closed-by-user") return "Sign-in was cancelled.";
  if (code === "auth/network-request-failed") return "Network error — check your connection.";
  return err?.message || "Something went wrong. Please try again.";
}

// ── Per-page auth button rendering ──────────────────────────────────────────
function renderAuthRoot(root) {
  if (!root) return;
  const isLight = root.dataset.theme === "light";

  if (currentUser) {
    const name = currentUser.displayName?.split(" ")[0] || currentUser.email?.split("@")[0] || "You";
    const photo = currentUser.photoURL;
    root.innerHTML = `
      <div class="auth-user-pill ${isLight ? "auth-user-pill--light" : ""}">
        ${photo ? `<img class="auth-avatar" src="${photo}" alt="" referrerpolicy="no-referrer" />` : `<span class="auth-avatar-initial">${name[0].toUpperCase()}</span>`}
        <span class="auth-user-name">${name}</span>
        <button class="auth-signout-btn" type="button" id="auth-signout-${Math.random().toString(36).slice(2)}">Sign out</button>
      </div>`;
    root.querySelector("[id^='auth-signout-']").addEventListener("click", () => doSignOut());
  } else {
    root.innerHTML = `<button class="auth-signin-btn ${isLight ? "auth-signin-btn--light" : ""}" type="button">Sign in</button>`;
    root.querySelector(".auth-signin-btn").addEventListener("click", openModal);
  }
}

function _renderAllAuthRoots() {
  document.querySelectorAll("[id='auth-root']").forEach(renderAuthRoot);
  // Also update greeting if on daily page
  const greeting = document.getElementById("daily-greeting");
  if (greeting) {
    const name = currentUser?.displayName?.split(" ")[0] || null;
    greeting.textContent = name
      ? `Here is your daily report, ${name}.`
      : "Here is your daily report.";
  }
}

// Mount when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _renderAllAuthRoots);
} else {
  _renderAllAuthRoots();
}

export { openModal, closeModal, doSignOut };
