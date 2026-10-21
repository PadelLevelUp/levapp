import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHIME_COALESCE_MS,
  playChime,
  resetChimeForTests,
  setNotificationSoundEnabled,
  shouldChime,
} from "./notificationSound";

const fromOther = { type: "message_created", payload: { senderId: 7, conversationId: 42 } };
const base = { myUserId: 3, pathname: "/calendar", attentive: true };

/** A running AudioContext that records the oscillators it starts. */
function fakeAudio() {
  const started: number[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const ctx = {
    state: "running",
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createOscillator: () => ({
      type: "sine",
      frequency: param(),
      connect: vi.fn(),
      start: (t: number) => started.push(t),
      stop: vi.fn(),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, started };
}

describe("notifications.notification-sound rule 2: what chimes", () => {
  it("a message from someone else chimes", () => {
    expect(shouldChime(fromOther, base)).toBe(true);
  });

  it("the user's own message echo does not", () => {
    expect(shouldChime({ type: "message_created", payload: { senderId: 3, conversationId: 42 } }, base)).toBe(false);
    expect(shouldChime({ type: "message_created", payload: { senderId: "3", conversationId: 42 } }, base)).toBe(false);
  });

  it("status events never chime: one arrival, one sound", () => {
    for (const type of ["notify_sent", "notification_responded", "join_request_created", "class_request_changed", "message_edited"]) {
      expect(shouldChime({ type, payload: { senderId: 7 } }, base)).toBe(false);
    }
  });

  it("the open thread in a focused tab does not chime; another thread, or an unfocused tab, does", () => {
    expect(shouldChime(fromOther, { ...base, pathname: "/messages/42" })).toBe(false);
    expect(shouldChime(fromOther, { ...base, pathname: "/messages/9" })).toBe(true);
    expect(shouldChime(fromOther, { ...base, pathname: "/messages/42", attentive: false })).toBe(true);
  });

  it("no signed-in user, or no sender, does not chime", () => {
    expect(shouldChime(fromOther, { ...base, myUserId: null })).toBe(false);
    expect(shouldChime({ type: "message_created", payload: {} }, base)).toBe(false);
  });
});

describe("notifications.notification-sound rules 1 and 3: when it plays", () => {
  beforeEach(() => resetChimeForTests());

  it("plays once for several messages within the window", () => {
    const { ctx, started } = fakeAudio();
    resetChimeForTests(ctx);
    expect(playChime(10_000)).toBe(true);
    expect(playChime(10_000 + CHIME_COALESCE_MS - 1)).toBe(false);
    expect(playChime(10_000 + CHIME_COALESCE_MS)).toBe(true);
    expect(started.length).toBe(4); // two notes per chime
  });

  it("the switch off plays nothing", () => {
    const { ctx, started } = fakeAudio();
    resetChimeForTests(ctx);
    setNotificationSoundEnabled(false);
    expect(playChime(10_000)).toBe(false);
    expect(started).toEqual([]);
  });

  it("before any interaction (no audio context, or a suspended one) it is skipped, not queued", () => {
    expect(playChime(10_000)).toBe(false);
    const { ctx } = fakeAudio();
    resetChimeForTests({ ...ctx, state: "suspended" } as unknown as AudioContext);
    expect(playChime(20_000)).toBe(false);
  });
});
