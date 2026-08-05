import { loadUserPrefs, saveUserPrefs } from "./firebase.js";

const WISHLIST_URL =
  "https://www.amazon.it/hz/wishlist/ls/6CV4RB9T1Y5S?ref_=wl_share";

// Session-scoped guard set only when "Let's go" is clicked.
// Using sessionStorage (not localStorage) so it never blocks a NEW user
// who happens to be on a browser where a PREVIOUS user completed the guide.
const SESSION_KEY = "hub-onboarded-session";

const STEPS = [
  {
    type: "standard",
    emoji: "🇪🇺",
    animated: true,
    title: "Welcome here, my friend.",
    body: "Start adding your EU open call websites, resources, news library links or even public Facebook groups you follow to the Library page.",
  },
  {
    type: "standard",
    emojiImg: "images/ob-search.png",
    emojiAlt: "Search",
    title: "Search through all of them at once.",
    body: "Use the search feature to instantly find opportunities across every source you've added, all at the same time.",
  },
  {
    type: "standard",
    emojiImg: "images/ob-music.png",
    emojiAlt: "Music",
    title: "There's background music.",
    body: "It's picked by Ela. You can't change it yet.",
  },
  {
    type: "wishlist",
    title: "No payments needed.",
    body: "This tool is completely free for you. Ela accepts only physical gifts.",
  },
  {
    type: "standard",
    emoji: "🔒",
    title: "No security issues.",
    body: "Nothing is controlled by META, Google or Apple. Made for FELCOS privately.",
  },
];

export async function showOnboardingIfNeeded(user) {
  if (!user) return;

  // If the user already clicked "Let's go" during this tab session, skip.
  if (sessionStorage.getItem(SESSION_KEY)) return;

  // Always check Firestore — localStorage is never used so new users on
  // a shared browser are never accidentally blocked.
  try {
    const prefs = await loadUserPrefs(user.uid);
    if (prefs.hasSeenOnboarding) return;
  } catch {
    return;
  }

  _showGuide(user);
}

function _showGuide(user) {
  let step = 0;

  const overlay = document.createElement("div");
  overlay.className = "ob-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Welcome guide");

  const popup = document.createElement("div");
  popup.className = "ob-popup";
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("ob-overlay--in"));

  function dotsHTML() {
    return `<div class="ob-dots">${STEPS.map((_, i) =>
      `<span class="ob-dot${i === step ? " ob-dot--active" : ""}"></span>`
    ).join("")}</div>`;
  }

  function actionsHTML() {
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;
    return `<div class="ob-actions">
      ${!isFirst
        ? `<button class="ghost-btn ob-prev" type="button">← Back</button>`
        : `<span></span>`}
      <button class="add-resource-btn ob-next" type="button">${isLast ? "Let's go!" : "Next →"}</button>
    </div>`;
  }

  function render() {
    const s = STEPS[step];

    if (s.type === "wishlist") {
      popup.innerHTML = `
        <div class="ob-wishlist-row">
          <a class="ob-wishlist-badge" href="${WISHLIST_URL}" target="_blank" rel="noopener noreferrer" aria-label="Ela's wishlist on Amazon">
            <span class="ob-wishlist-label">Wishlist of Ela</span>
            <div class="ob-wishlist-items">
              <img src="images/ob-wishlist-lipstick.png" alt="Lipstick" class="ob-wishlist-img" />
              <img src="images/ob-wishlist-macbook.png"  alt="MacBook"  class="ob-wishlist-img ob-wishlist-img--mac" />
            </div>
          </a>
        </div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-body">${s.body}</p>
        ${dotsHTML()}
        ${actionsHTML()}`;
    } else {
      const visual = s.emojiImg
        ? `<img src="${s.emojiImg}" alt="${s.emojiAlt}" class="ob-img${s.animated ? " ob-img--bounce" : ""}" />`
        : `<span class="ob-emoji${s.animated ? " ob-emoji--bounce" : ""}">${s.emoji}</span>`;

      popup.innerHTML = `
        ${visual}
        <h2 class="ob-title${s.animated ? " ob-title--typewriter" : ""}">${s.title}</h2>
        <p class="ob-body">${s.body}</p>
        ${dotsHTML()}
        ${actionsHTML()}`;
    }

    popup.querySelector(".ob-next").addEventListener("click", () => {
      if (step === STEPS.length - 1) { dismiss(); return; }
      step++;
      render();
    });
    if (step > 0) {
      popup.querySelector(".ob-prev").addEventListener("click", () => { step--; render(); });
    }
  }

  function dismiss() {
    // Prevent re-show on page navigations within this tab session
    sessionStorage.setItem(SESSION_KEY, "1");
    overlay.classList.add("ob-overlay--out");
    setTimeout(() => overlay.remove(), 320);
    // Persist to Firestore so future browser sessions also skip it
    saveUserPrefs(user.uid, { hasSeenOnboarding: true }).catch(() => {});
  }

  render();
}
