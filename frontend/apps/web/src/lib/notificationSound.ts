/**
 * notifications.notification-sound (PAD-680) rules 2–3: the web chime for a message from someone
 * else — which is also how every system notification arrives (an invitation, a reminder, a request
 * alert are messages in a conversation).
 *
 * The chime is synthesized with Web Audio: no audio file, no third-party host. Browsers only let a
 * page make sound after the person has interacted with it (autoplay rule), so the AudioContext is
 * created on the first pointer or key event; before that a chime is skipped, never queued.
 */

export interface ChimeEvent {
  type: string;
  payload?: unknown;
}

export interface ChimeContext {
  /** The signed-in user's id. */
  myUserId: number | string | null | undefined;
  /** The current route, e.g. `/messages/42`. */
  pathname: string;
  /** The page is visible and focused (the person is looking at it). */
  attentive: boolean;
}

/** Rules 2–3: does this SSE event deserve a chime? Pure, so the rules are unit-tested. */
export function shouldChime(event: ChimeEvent, ctx: ChimeContext): boolean {
  if (event.type !== "message_created") return false;
  const payload = (event.payload ?? {}) as { senderId?: unknown; conversationId?: unknown };
  if (ctx.myUserId == null || payload.senderId == null) return false;
  if (String(payload.senderId) === String(ctx.myUserId)) return false; // own echo (sse-realtime rule 19)
  const open = ctx.pathname.match(/^\/messages\/([^/]+)/);
  if (ctx.attentive && open && payload.conversationId != null && open[1] === String(payload.conversationId)) {
    return false; // that thread is on screen and the person is looking at it
  }
  return true;
}

/** Several messages within this window play one chime (rule 3). */
export const CHIME_COALESCE_MS = 2000;

let enabled = true;
let lastChimeAt = Number.NEGATIVE_INFINITY;
let context: AudioContext | null = null;
let unlockInstalled = false;

/** Rule 1: the signed-in user's switch (from /auth/me, and after each Settings save). */
export function setNotificationSoundEnabled(value: boolean): void {
  enabled = value;
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Rule 3, autoplay: the AudioContext is made (or resumed) inside the first interaction. */
export function installChimeUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      context = context ?? new Ctor();
      if (context.state === "suspended") void context.resume();
    } catch {
      context = null; // no audio on this browser: the chime stays silent
    }
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

/** Plays the chime if the switch is on, the page may make sound, and none played just now. */
export function playChime(now: number = Date.now()): boolean {
  if (!enabled) return false;
  if (now - lastChimeAt < CHIME_COALESCE_MS) return false;
  if (!context || context.state !== "running") return false; // before any interaction: skipped
  lastChimeAt = now;
  try {
    const start = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    // Two soft sine notes, a rising fifth: short and distinct from the OS sounds.
    [
      [880, 0],
      [1318.5, 0.11],
    ].forEach(([freq, offset]) => {
      const osc = context!.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start + offset);
      osc.connect(gain);
      osc.start(start + offset);
      osc.stop(start + 0.45);
    });
    return true;
  } catch {
    return false;
  }
}

/** Test seam: forget the coalescing window and the audio context. */
export function resetChimeForTests(audio: AudioContext | null = null): void {
  lastChimeAt = Number.NEGATIVE_INFINITY;
  context = audio;
  enabled = true;
}
