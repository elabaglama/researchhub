import { loadUserPrefs, saveUserPrefs } from "./firebase.js?v=20260806b";
import { t } from "./i18n.js?v=20260806b";

const WISHLIST_URL =
  "https://www.amazon.it/hz/wishlist/ls/6CV4RB9T1Y5S?ref_=wl_share";

const sessionKey = (uid) => `hub-ob-session-${uid}`;
const localKey = (uid) => `hub-ob-${uid}`;
const PENDING_GUIDE_KEY = "hub-ob-pending";

function buildSteps() {
  return [
    {
      type: "standard",
      emojiImg: "images/ob-flag.png",
      emojiAlt: "EU flag",
      animated: true,
      title: t("guide.step1.title"),
      body: t("guide.step1.body"),
    },
    {
      type: "standard",
      emojiImg: "images/ob-search.png",
      emojiAlt: "Search",
      title: t("guide.step2.title"),
      body: t("guide.step2.body"),
    },
    {
      type: "standard",
      emojiImg: "images/ob-music.png",
      emojiAlt: "Music",
      title: t("guide.step3.title"),
      body: t("guide.step3.body"),
    },
    {
      type: "wishlist",
      title: t("guide.step4.title"),
      body: t("guide.step4.body"),
    },
    {
      type: "standard",
      emojiImg: "images/ob-lock.png",
      emojiAlt: "Lock",
      title: t("guide.step5.title"),
      body: t("guide.step5.body"),
    },
  ];
}

/** Call right after createUserWithEmailAndPassword / first Google sign-in. */
export function markPendingGuide(uid) {
  if (!uid) return;
  sessionStorage.setItem(PENDING_GUIDE_KEY, uid);
  sessionStorage.removeItem(sessionKey(uid));
  localStorage.removeItem(localKey(uid));
}

function isPendingGuide(uid) {
  return sessionStorage.getItem(PENDING_GUIDE_KEY) === uid;
}

function clearPendingGuide(uid) {
  if (sessionStorage.getItem(PENDING_GUIDE_KEY) === uid) {
    sessionStorage.removeItem(PENDING_GUIDE_KEY);
  }
}

function isNewAccount(user) {
  try {
    const created = new Date(user.metadata.creationTime).getTime();
    const lastSignIn = new Date(user.metadata.lastSignInTime).getTime();
    const ageMs = Date.now() - created;
    return ageMs < 10 * 60 * 1000 && Math.abs(created - lastSignIn) < 120 * 1000;
  } catch {
    return false;
  }
}

export function forceShowGuide(user) {
  if (!user) return;
  sessionStorage.removeItem(sessionKey(user.uid));
  localStorage.removeItem(localKey(user.uid));
  clearPendingGuide(user.uid);
  document.querySelector(".ob-overlay")?.remove();
  _showGuide(user);
}

export async function showOnboardingIfNeeded(user) {
  if (!user) return;
  if (sessionStorage.getItem(sessionKey(user.uid))) return;
  if (document.querySelector(".ob-overlay")) return;

  const pending = isPendingGuide(user.uid);
  const brandNew = isNewAccount(user);

  if (pending || brandNew) {
    localStorage.removeItem(localKey(user.uid));
    _showGuide(user);
    return;
  }

  if (localStorage.getItem(localKey(user.uid))) return;

  try {
    const prefs = await Promise.race([
      loadUserPrefs(user.uid),
      new Promise((resolve) => setTimeout(() => resolve({}), 2000)),
    ]);
    if (prefs.hasSeenOnboarding) {
      localStorage.setItem(localKey(user.uid), "1");
      return;
    }
  } catch {
    /* show anyway */
  }

  _showGuide(user);
}

function _showGuide(user) {
  let step = 0;
  const STEPS = buildSteps();

  const overlay = document.createElement("div");
  overlay.className = "ob-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Welcome guide");

  const popup = document.createElement("div");
  popup.className = "ob-popup";
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => overlay.classList.add("ob-overlay--in"))
  );

  function dotsHTML() {
    return STEPS.map((_, i) =>
      `<span class="ob-dot${i === step ? " ob-dot--active" : ""}"></span>`
    ).join("");
  }

  function render() {
    const s = STEPS[step];
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;

    let contentHTML;
    if (s.type === "wishlist") {
      contentHTML = `
        <div class="ob-wishlist-row">
          <a class="ob-wishlist-badge" href="${WISHLIST_URL}" target="_blank" rel="noopener noreferrer" aria-label="${t("guide.wishlist")}">
            <div class="ob-wishlist-items">
              <img src="images/ob-wishlist-macbook.png" alt="MacBook" class="ob-wishlist-img ob-wishlist-img--mac" />
            </div>
            <span class="ob-wishlist-label">${t("guide.wishlist")}</span>
          </a>
        </div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-body">${s.body}</p>`;
    } else {
      contentHTML = `
        <img src="${s.emojiImg}" alt="${s.emojiAlt}" class="ob-img${s.animated ? " ob-img--bounce" : ""}" />
        <h2 class="ob-title${s.animated ? " ob-title--typewriter" : ""}">${s.title}</h2>
        <p class="ob-body">${s.body}</p>`;
    }

    popup.innerHTML = `
      <div class="ob-content">${contentHTML}</div>
      <div class="ob-footer">
        <div class="ob-dots">${dotsHTML()}</div>
        <div class="ob-actions">
          ${!isFirst
            ? `<button class="ghost-btn ob-prev" type="button">${t("guide.back")}</button>`
            : `<span></span>`}
          <button class="add-resource-btn ob-next" type="button">${isLast ? t("guide.start") : t("guide.next")}</button>
        </div>
      </div>`;

    popup.querySelector(".ob-next").addEventListener("click", () => {
      if (step === STEPS.length - 1) { dismiss(); return; }
      step++;
      render();
    });
    if (!isFirst) {
      popup.querySelector(".ob-prev").addEventListener("click", () => {
        step--;
        render();
      });
    }
  }

  function dismiss() {
    sessionStorage.setItem(sessionKey(user.uid), "1");
    localStorage.setItem(localKey(user.uid), "1");
    clearPendingGuide(user.uid);
    overlay.classList.add("ob-overlay--out");
    setTimeout(() => overlay.remove(), 320);
    saveUserPrefs(user.uid, { hasSeenOnboarding: true }).catch(() => {});
  }

  render();
}
