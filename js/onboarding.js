import { loadUserPrefs, saveUserPrefs } from "./firebase.js";

const WISHLIST_URL =
  "https://www.amazon.it/hz/wishlist/ls/6CV4RB9T1Y5S?ref_=wl_share";

// SESSION_KEY — cleared when the tab closes (prevents re-show while navigating pages)
const SESSION_KEY = "hub-ob-session";
// Per-user local key — persists across sessions so returning users skip the guide
const localKey = (uid) => `hub-ob-${uid}`;

const STEPS = [
  {
    type: "standard",
    emojiImg: "images/ob-flag.png",
    emojiAlt: "EU flag",
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
    emojiImg: "images/ob-lock.png",
    emojiAlt: "Lock",
    title: "No security issues.",
    body: "Nothing is controlled by META, Google or Apple. Made for FELCOS privately.",
  },
];

export async function showOnboardingIfNeeded(user) {
  if (!user) return;

  // Fast synchronous checks — no network needed
  if (sessionStorage.getItem(SESSION_KEY)) return;
  if (localStorage.getItem(localKey(user.uid))) return;

  // Firestore check with a 2-second safety timeout.
  // If Firestore hangs (permission error, network issue, unconfigured DB),
  // we fall through after 2 s and show the guide anyway.
  try {
    const prefs = await Promise.race([
      loadUserPrefs(user.uid),
      new Promise((resolve) => setTimeout(() => resolve({}), 2000)),
    ]);
    if (prefs.hasSeenOnboarding) {
      // Cache locally so we skip the network round-trip next time
      localStorage.setItem(localKey(user.uid), "1");
      return;
    }
  } catch {
    // Firestore threw — show the guide regardless
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

  // Double rAF guarantees the browser has computed the element's initial
  // opacity:0 before we add the --in class, so the CSS transition always fires.
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
          <a class="ob-wishlist-badge" href="${WISHLIST_URL}" target="_blank" rel="noopener noreferrer" aria-label="Ela's wishlist on Amazon">
            <span class="ob-wishlist-label">Wishlist of Ela</span>
            <div class="ob-wishlist-items">
              <img src="images/ob-wishlist-lipstick.png" alt="Lipstick" class="ob-wishlist-img" />
              <img src="images/ob-wishlist-macbook.png"  alt="MacBook"  class="ob-wishlist-img ob-wishlist-img--mac" />
            </div>
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
            ? `<button class="ghost-btn ob-prev" type="button">← Back</button>`
            : `<span></span>`}
          <button class="add-resource-btn ob-next" type="button">${isLast ? "Let's go!" : "Next →"}</button>
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
    // Mark as seen in every storage layer immediately
    sessionStorage.setItem(SESSION_KEY, "1");
    localStorage.setItem(localKey(user.uid), "1");
    overlay.classList.add("ob-overlay--out");
    setTimeout(() => overlay.remove(), 320);
    // Also write to Firestore for cross-device persistence
    saveUserPrefs(user.uid, { hasSeenOnboarding: true }).catch(() => {});
  }

  render();
}
