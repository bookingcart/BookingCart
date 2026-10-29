import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Sound effects for confirmed bookings and incoming notifications.
 *
 * The chimes are synthesised with the Web Audio API rather than shipped as
 * audio files: nothing to download, no codec support to worry about, and a
 * booking reminder never fires late because a clip was still loading.
 *
 * Browsers block audio until the visitor has interacted with the page, so the
 * context is created on the first pointer/key event (see initSound) and any
 * chime requested before that is held briefly and replayed on unlock.
 */

export const SOUND_KEY = 'bc_sound';
const PLAYED_KEY = 'bc_sound_played';
const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const PENDING_TTL_MS = 10 * 1000;

const listeners = new Set();
let audio = null;
let master = null;
let unlocked = false;
let pending = null;
let unlockBound = false;

/* ─── Preference ─────────────────────────────────────────────────────────── */

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    // Storage blocked (private mode) — better to stay audible than to fail.
    return true;
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeSound(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    // Preference is best-effort; the session still behaves consistently.
  }
  if (enabled) {
    unlocked = true;
    ensureAudio();
    // Hear what was just switched on.
    setTimeout(() => playSound('notification'), 60);
  }
  notify();
}

export function toggleSound() {
  setSoundEnabled(!soundEnabled());
}

/* ─── Synthesis ──────────────────────────────────────────────────────────── */

function ensureAudio() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctor) return null;
  try {
    audio = new Ctor();
    master = audio.createGain();
    master.gain.value = 0.7;
    master.connect(audio.destination);
  } catch {
    audio = null;
    master = null;
  }
  return audio;
}

// One soft note: quick attack, exponential tail, so it never clicks.
function tone({ freq, at, duration, peak, type = 'sine' }) {
  if (!audio || !master) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

const CHIMES = {
  // Rising C major arpeggio with a shimmer on top — "paid, you're going".
  booking(at) {
    [
      [523.25, 0.0, 0.3, 0.16],
      [659.25, 0.09, 0.3, 0.15],
      [783.99, 0.18, 0.42, 0.15],
      [1046.5, 0.3, 0.55, 0.1],
    ].forEach(([freq, offset, duration, peak]) => {
      tone({ freq, at: at + offset, duration, peak, type: 'triangle' });
    });
  },
  // Two-note ping, deliberately shorter and quieter than the booking chime.
  notification(at) {
    tone({ freq: 880, at, duration: 0.22, peak: 0.12 });
    tone({ freq: 1174.66, at: at + 0.11, duration: 0.3, peak: 0.1 });
  },
};

/**
 * Play a named chime. Returns true when it was scheduled, false when the
 * preference is off, the name is unknown, or a gesture is still missing.
 */
export function playSound(name) {
  if (!soundEnabled() || !CHIMES[name]) return false;
  if (!unlocked) {
    // A same-origin page load ("Pay" → /confirmation) keeps the tab's sticky
    // activation, so the new document can play straight away instead of
    // waiting for another click.
    if (!activationCarried()) {
      // Safari/Chrome need a gesture first: hold the chime for a few seconds so
      // a notification that lands before the first tap still gets its sound.
      pending = { name, at: Date.now() };
      return false;
    }
    unlocked = true;
  }
  const ctx = ensureAudio();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    pending = { name, at: Date.now() };
    ctx.resume().catch(() => {});
    return false;
  }
  CHIMES[name](ctx.currentTime + 0.02);
  return true;
}

// Sticky activation survives a same-origin navigation even though the audio
// context of the previous document does not.
function activationCarried() {
  try {
    return Boolean(navigator.userActivation?.hasBeenActive);
  } catch {
    return false;
  }
}

export function playBookingSound() {
  return playSound('booking');
}

export function playNotificationSound() {
  return playSound('notification');
}

/**
 * Chime for the booking that was just paid for, from the page where the visitor
 * still has a fresh gesture (the checkout, before it hands over to the
 * confirmation page). The confirmation page uses the same key, so the fanfare
 * never plays twice for one booking.
 */
export function playBookingChime(key) {
  if (!key) return false;
  if (alreadyPlayed(`booking:${key}`)) return false;
  return playSound('booking');
}

/**
 * Unlock audio on the first user gesture. Called once from main.jsx; safe to
 * call again (for example after a hot reload) because it only binds once.
 */
export function initSound() {
  if (unlockBound || typeof window === 'undefined') return () => {};
  unlockBound = true;

  const unlock = () => {
    unlocked = true;
    ensureAudio();
    const queued = pending && Date.now() - pending.at < PENDING_TTL_MS ? pending.name : null;
    pending = null;
    // Let resume() settle before scheduling the held chime.
    if (queued) setTimeout(() => playSound(queued), 150);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
  return unlock;
}

/* ─── Once-per-booking guard ─────────────────────────────────────────────── */

// Revisiting a ticket link must not replay the fanfare, but a second booking
// in the same tab must. Keys expire so the tab does not accumulate state.
function alreadyPlayed(key) {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(PLAYED_KEY);
    const seen = raw ? JSON.parse(raw) : {};
    const recent = {};
    Object.entries(seen).forEach(([id, at]) => {
      if (typeof at === 'number' && now - at < REPLAY_WINDOW_MS) recent[id] = at;
    });
    const duplicate = typeof seen[key] === 'number' && now - seen[key] < REPLAY_WINDOW_MS;
    if (!duplicate) {
      recent[key] = now;
      sessionStorage.setItem(PLAYED_KEY, JSON.stringify(recent));
    }
    return duplicate;
  } catch {
    return false;
  }
}

/**
 * Chime once for a confirmed booking.
 * Pass the booking reference (anything unique per booking); a falsy key means
 * the booking has not resolved yet and stays silent.
 */
export function useBookingSound(key) {
  useEffect(() => {
    if (!key) return;
    playBookingChime(key);
  }, [key]);
}

export function useSound() {
  const enabled = useSyncExternalStore(subscribeSound, soundEnabled, () => true);
  const toggle = useCallback(() => toggleSound(), []);
  return { enabled, toggle, setEnabled: setSoundEnabled };
}
