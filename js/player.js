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

// Seek to the saved time as soon as the audio element is ready.
function restoreTime(audio, time) {
  if (!time || time <= 0) return;
  const doSeek = () => { try { audio.currentTime = time; } catch { /* ignore */ } };
  // readyState >= 1 means HAVE_METADATA — safe to seek
  if (audio.readyState >= 1) doSeek();
  else audio.addEventListener("loadedmetadata", doSeek, { once: true });
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

  // Restore position from previous page (0 if this is a fresh session)
  restoreTime(audio, state.time);

  const setVisual = (playing) => {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  };

  const setPlaying = (playing) => {
    setVisual(playing);
    persist(audio, playing);
  };

  // Spin the disc immediately (optimistic — audio catches up once unlocked)
  setVisual(state.playing !== false);

  // ── Try to play. Falls back to muted play which browsers almost always allow.
  const tryPlay = async () => {
    // Attempt 1: normal unmuted play
    try {
      await audio.play();
      audio.muted = false; // in case it was muted from a prior attempt
      setPlaying(true);
      return true;
    } catch {
      /* autoplay policy blocked it */
    }

    // Attempt 2: muted play (allowed by virtually every browser, even without gesture)
    try {
      audio.muted = true;
      await audio.play();
      setPlaying(true);
      // Unmute after 250 ms — short enough to be imperceptible, long enough for
      // the browser to register the playback as "user has engaged with the page".
      setTimeout(() => { if (!audio.paused) audio.muted = false; }, 250);
      return true;
    } catch {
      return false;
    }
  };

  let unlocked = false;

  const unlockAndPlay = () => {
    if (unlocked) return;
    unlocked = true;
    if (savedState().playing !== false) tryPlay();
  };

  // Manual play/pause toggle
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    unlocked = true;

    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }

    await tryPlay();
  });

  // Persist position continuously
  audio.addEventListener("timeupdate", () => {
    if (!audio.paused) persist(audio, true);
  });

  // Save position before navigating away
  window.addEventListener("pagehide", () => persist(audio, !audio.paused));
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist(audio, !audio.paused);
  });

  // Start autoplay sequence if the saved state says we should be playing
  if (state.playing !== false) {
    tryPlay().then((ok) => {
      if (ok) return;
      // Both normal and muted play failed — wait for any user interaction.
      const unlock = () => unlockAndPlay();
      window.addEventListener("pointerdown", unlock, { once: true, capture: true });
      window.addEventListener("keydown",     unlock, { once: true, capture: true });
      window.addEventListener("hub:signed-in", unlock, { once: true });
    });
  }
}

mountPlayer();
