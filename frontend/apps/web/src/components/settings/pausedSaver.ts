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
 * The value still inside the pause is NOT in the serial saver yet, so sign-out does not
 * reach it: the owner calls `dispose()` instead of `flush()` when there is no session.
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
  /** Forget what is inside the pause and what is waiting to be sent, without sending either. */
  dispose(): void;
}

export function createPausedSaver<T>(options: {
  delayMs: number;
  send: (value: T) => void | Promise<unknown>;
}): PausedSaver<T> {
  const serial = createSerialSaver<T, unknown>(async (value) => options.send(value));
  let paused: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

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
    serial(value).catch(() => undefined);
  };

  return {
    push(value) {
      paused = { value };
      clearTimer();
      timer = setTimeout(hand, options.delayMs);
    },
    flush: hand,
    busy: () => paused !== null || serial.busy(),
    dispose() {
      clearTimer();
      paused = null;
      serial.drop();
    },
  };
}
