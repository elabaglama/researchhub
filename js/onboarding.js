import { loadUserPrefs, saveUserPrefs } from "./firebase.js";

const STEPS = [
  {
    emoji: "👋",
    title: "Welcome here, my friend.",
    body: "Start adding your EU open call websites, resources, news library links — or even public Facebook groups you follow — to the Library page.",
    animated: true,
  },
  {
    emoji: "🔍",
    title: "Search through all of them at once.",
    body: "Use the search feature to instantly find opportunities across every source you've added, all at the same time.",
  },
  {
    emoji: "🎵",
    title: "There's background music.",
    body: "It's hand-picked by Ela. It starts playing automatically and keeps going as you move between pages.",
  },
  {
    emoji: "🎁",
    title: "No payments needed.",
    body: "This tool is completely free. Only physical gifts are accepted.",
  },
];

export async function showOnboardingIfNeeded(user) {
  if (!user) return;
  try {
    const prefs = await loadUserPrefs(user.uid);
    if (prefs.hasSeenOnboarding) return;
  } catch {
    return; // Firestore not available — skip
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

  // Small delay so the auth gate exit animation finishes first
  requestAnimationFrame(() => overlay.classList.add("ob-overlay--in"));

  function render() {
    const s = STEPS[step];
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;

    popup.innerHTML = `
      <button class="ob-skip" aria-label="Skip guide">Skip</button>
      <div class="ob-emoji ${s.animated ? "ob-emoji--bounce" : ""}">${s.emoji}</div>
      <h2 class="ob-title ${s.animated ? "ob-title--typewriter" : ""}">${s.title}</h2>
      <p class="ob-body">${s.body}</p>
      <div class="ob-dots" role="tablist" aria-label="Step ${step + 1} of ${STEPS.length}">
        ${STEPS.map((_, i) => `<span class="ob-dot${i === step ? " ob-dot--active" : ""}"></span>`).join("")}
      </div>
      <div class="ob-actions">
        ${!isFirst
          ? `<button class="ghost-btn ob-prev" type="button">← Back</button>`
          : `<span></span>`}
        <button class="add-resource-btn ob-next" type="button">
          ${isLast ? "Let's go! 🚀" : "Next →"}
        </button>
      </div>`;

    // Wire
    popup.querySelector(".ob-skip").addEventListener("click", dismiss);
    popup.querySelector(".ob-next").addEventListener("click", () => {
      if (isLast) { dismiss(); return; }
      step++;
      render();
    });
    if (!isFirst) {
      popup.querySelector(".ob-prev").addEventListener("click", () => { step--; render(); });
    }
  }

  async function dismiss() {
    overlay.classList.add("ob-overlay--out");
    setTimeout(() => overlay.remove(), 320);
    // Mark as seen so it never shows again for this user
    saveUserPrefs(user.uid, { hasSeenOnboarding: true }).catch(() => {});
  }

  render();
}
