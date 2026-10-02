/**
 * PAD-478 (notifications.config rule 10d): a pause in front of the shared serial saver.
 *
 * A control that changes in steps (a stepper, the segments of a time field) pushes each
 * value here. Nothing is sent while the values keep coming; after `delayMs` without a new
 * one, the latest value is handed to `createSerialSaver` (`@levelup/config`,
 * settings.save-on-change rule 3), which keeps one save in flight, lets only the latest
 * waiting value go next, still sends that value when the one in flight fails, and drops
 * what is waiting when the user signs out (`dropPendingSaves`).
 *
 * This queue lives as long as its owner. When the owner goes away with a session (`close()`),
 * what it still holds is handed straight to `send`, not left to wait for the save in flight:
 * `send` is the card's save, which has its own one-in-flight queue for the whole card, and a
 * value left waiting here would go out AFTER whatever the reopened form sends (review of #496).
 *
 * The value still inside the pause is NOT in the serial saver yet, so sign-out does not
 * reach it: when the owner goes away with no session it calls `dispose()`, not `close()`.
 *
 * The backend does not depend on any of this (rule 10e: any sequence of saves gives the
 * same jobs); it spares it a reschedule of every future job per keystroke.
 */
import { createSerialSaver } from "@levelup/config";

export interface PausedSaver<T> {
  /** A new value from the control. Restarts the pause. */
  push(value: T): void;
  /** Send what is inside the pause now (the field lost focus, the section is closing). */
  flush(): void;
  /** Whether a value is inside the pause, waiting to be sent, or being sent. */
  busy(): boolean;
  /** The owner is going away (the section closes): hand what this saver still holds, inside the
   *  pause or waiting behind a save in flight, straight to `send`, newest value only. */
  close(): void;
  /** Forget what is inside the pause and what is waiting to be sent, without sending either. */
  dispose(): void;
}

export function createPausedSaver<T>(options: {
  delayMs: number;
  send: (value: T) => void | Promise<unknown>;
  /** Called each time a value handed to `send` has settled (confirmed, failed, or dropped before
   *  it left), AFTER this saver's own state moved on: `busy()` read inside it is already true or
   *  false for what comes next. The owner re-reads the saved value here (review of #496). */
  onSettled?: () => void;
}): PausedSaver<T> {
  const serial = createSerialSaver<T, unknown>(async (value) => options.send(value));
  let paused: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const told = () => options.onSettled?.();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const hand = () => {
    clearTimer();
    if (paused === null) return;
    const { value } = paused;
    paused = null;
    // The outcome belongs to whoever owns `send` (the card's save signs and rolls back); a
    // value replaced or dropped before it left rejects here, and that is not an error.
    serial(value).then(told, told);
  };

  return {
    push(value) {
      paused = { value };
      clearTimer();
      timer = setTimeout(hand, options.delayMs);
    },
    flush: hand,
    busy: () => paused !== null || serial.busy(),
    close() {
      clearTimer();
      if (paused !== null) {
        // The newest value is the one inside the pause; what waited behind the save in flight is older.
        const { value } = paused;
        paused = null;
        serial.drop();
        let sent: void | Promise<unknown>;
        try {
          sent = options.send(value);
        } catch {
          sent = undefined;
        }
        Promise.resolve(sent).then(told, told);
      } else {
        serial.sendPendingNow();
      }
    },
    dispose() {
      clearTimer();
      paused = null;
      serial.drop();
    },
  };
}
