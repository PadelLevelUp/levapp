/**
 * PAD-478 (notifications.config rule 10d): one save per edit. The reminders form used to
 * send a save on every stepper tap and on every segment edit of the time field; each one
 * re-armed every future job of the coach. The saver sends once, after the coach pauses,
 * with the final value, and keeps saves in order: one in flight, the latest value next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPausedSaver } from "./pausedSaver";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPausedSaver", () => {
  it("sends once, with the final value, after the pause", async () => {
    const send = vi.fn();
    const saver = createPausedSaver<number>({ delayMs: 600, send });

    saver.push(25);
    saver.push(26);
    saver.push(27);
    expect(send).not.toHaveBeenCalled();
    expect(saver.busy()).toBe(true);

    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(27);
  });

  it("restarts the pause on every change", async () => {
    const send = vi.fn();
    const saver = createPausedSaver<number>({ delayMs: 600, send });

    saver.push(1);
    await vi.advanceTimersByTimeAsync(500);
    saver.push(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(2);
  });

  it("keeps one save in flight and sends only the latest value next", async () => {
    const first = deferred();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const saver = createPausedSaver<number>({ delayMs: 600, send });

    saver.push(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1);

    saver.push(2);
    saver.push(3);
    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1); // the first is still in flight
    expect(saver.busy()).toBe(true);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.busy()).toBe(false);
  });

  it("flush sends what is pending at once (the field lost focus, the section closed)", async () => {
    const send = vi.fn();
    const saver = createPausedSaver<string>({ delayMs: 600, send });

    saver.push("09:30");
    saver.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("09:30");

    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1); // the pause's timer does not send it again
  });

  it("flush with nothing pending sends nothing", () => {
    const send = vi.fn();
    createPausedSaver<number>({ delayMs: 600, send }).flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("a failed save does not block the next one", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const saver = createPausedSaver<number>({ delayMs: 600, send });

    saver.push(1);
    await vi.advanceTimersByTimeAsync(600);
    saver.push(2);
    await vi.advanceTimersByTimeAsync(600);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(2);
  });

  it("dispose drops what is pending without sending it", async () => {
    const send = vi.fn();
    const saver = createPausedSaver<number>({ delayMs: 600, send });

    saver.push(1);
    saver.dispose();
    await vi.advanceTimersByTimeAsync(600);
    expect(send).not.toHaveBeenCalled();
  });
});
