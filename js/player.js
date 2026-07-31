const KEY = "research-hub-music";

function ensureAudio() {
  let audio = document.getElementById("hub-audio");
  if (audio) return audio;

  audio = document.createElement("audio");
  audio.id = "hub-audio";
  audio.src = "/audio/amore-dice-ciao.mp3";
  audio.loop = true;
  audio.preload = "auto";
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
    <button class="music-player" type="button" aria-label="Pause music" title="Amore Dice Ciao — click to play/pause">
      <img class="vinyl" src="/assets/turntable.png" alt="" width="96" height="96" draggable="false" />
    </button>
  `;

  const button = root.querySelector(".music-player");
  let unlocked = false;

  const setPlaying = (playing) => {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
    persist(audio, playing);
  };

  const tryPlay = async () => {
    try {
      await audio.play();
      setPlaying(true);
      return true;
    } catch {
      setPlaying(false);
      return false;
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

    try {
      if (state.time > 0 && audio.currentTime < 0.2) {
        audio.currentTime = state.time;
      }
    } catch {
      /* ignore seek errors */
    }

    await tryPlay();
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.paused) persist(audio, true);
  });

  if (state.playing !== false) {
    try {
      if (state.time > 0) audio.currentTime = state.time;
    } catch {
      /* ignore */
    }

    tryPlay().then((ok) => {
      if (ok) return;
      const unlock = (event) => {
        if (unlocked) return;
        if (event.target.closest?.(".music-player")) return;
        unlocked = true;
        if (savedState().playing !== false) tryPlay();
      };
      window.addEventListener("pointerdown", unlock, {
        once: true,
        capture: true,
      });
      window.addEventListener("keydown", unlock, { once: true, capture: true });
    });
  } else {
    setPlaying(false);
  }
}

mountPlayer();
