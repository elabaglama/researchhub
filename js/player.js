const KEY = "research-hub-music";
const TRACK = {
  src: "audio/pinar-basindan.m4a",
  fallbackSrc: "audio/pinar-basindan.webm",
  title: "Pınar Başından Bulanır — Hande Dalkılıç",
};

function ensureAudio() {
  let audio = document.getElementById("hub-audio");
  if (audio) return audio;

  audio = document.createElement("audio");
  audio.id = "hub-audio";
  audio.src = TRACK.src;
  audio.loop = true;
  audio.preload = "auto";
  audio.addEventListener("error", () => {
    if (audio.dataset.fallbackApplied) return;
    audio.dataset.fallbackApplied = "1";
    audio.src = TRACK.fallbackSrc;
    audio.load();
  });
  document.body.appendChild(audio);
  return audio;
}

function savedState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { playing: true, time: 0 };
    return JSON.parse(raw);
  } catch {
    return { playing: true, time: 0 };
  }
}

function persist(audio, playing) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ playing, time: audio.currentTime || 0 })
  );
}

function mountPlayer() {
  const root = document.getElementById("music-player-root");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  const audio = ensureAudio();
  const state = savedState();

  root.innerHTML = `
    <button class="music-player" type="button" aria-label="Pause music" title="${TRACK.title} — tap to play/pause">
      <img class="vinyl" src="assets/music-element.png?v=1" alt="" width="128" height="128" draggable="false" />
    </button>
  `;

  const button = root.querySelector(".music-player");

  // Restore position immediately so timeupdate works correctly.
  try {
    if (state.time > 0) audio.currentTime = state.time;
  } catch {
    /* ignore seek errors before metadata loads */
  }

  const setVisual = (playing) => {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  };

  const setPlaying = (playing) => {
    setVisual(playing);
    persist(audio, playing);
  };

  // Disc spins immediately — optimistic UI. Audio will catch up once unlocked.
  if (state.playing !== false) {
    setVisual(true);
  } else {
    setVisual(false);
  }

  const tryPlay = async () => {
    try {
      await audio.play();
      setPlaying(true);
      return true;
    } catch {
      // Browser blocked autoplay — disc keeps spinning, audio will start on first interaction.
      return false;
    }
  };

  let unlocked = false;

  const unlockAndPlay = () => {
    if (unlocked) return;
    unlocked = true;
    if (savedState().playing !== false) {
      tryPlay();
    }
  };

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    unlocked = true;

    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }

    // Restore position if we haven't seeked yet (e.g. after page nav).
    try {
      const s = savedState();
      if (s.time > 0 && audio.currentTime < 0.5) {
        audio.currentTime = s.time;
      }
    } catch {
      /* ignore */
    }

    await tryPlay();
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.paused) persist(audio, true);
  });

  // Save position right before the page is navigated away.
  window.addEventListener("pagehide", () => persist(audio, !audio.paused));
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist(audio, !audio.paused);
  });

  if (state.playing !== false) {
    tryPlay().then((ok) => {
      if (ok) return;
      // Autoplay blocked: hook into any user gesture on the page to unlock.
      const unlock = () => unlockAndPlay();
      window.addEventListener("pointerdown", unlock, { once: true, capture: true });
      window.addEventListener("keydown", unlock, { once: true, capture: true });
    });
  }
}

mountPlayer();
