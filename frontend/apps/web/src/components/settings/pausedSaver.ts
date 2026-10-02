/**
 * PAD-478 (notifications.config rule 10d): one save per edit, in order.
 *
 * A control that changes in steps (a stepper, the segments of a time field) pushes each
 * value here. Nothing is sent while the values keep coming; after `delayMs` without a new
 * one, the latest value is sent. Only one save is in flight at a time: a value that arrives
 * meanwhile waits, and when the save settles only the latest waiting value is sent. So the
 * server receives the final value last, whatever the network does to the earlier ones.
 *
 * The backend does not depend on this (rule 10e: any sequence of saves gives the same jobs);
 * it spares it a reschedule of every future job per keystroke.
 */
export interface PausedSaver<T> {
  /** A new value from the control. Restarts the pause. */
  push(value: T): void;
  /** Send what is pending now (the field lost focus, the section is closing). */
  flush(): void;
  /** Whether a value is waiting or a save is in flight. */
  busy(): boolean;
  /** Forget what is pending without sending it. */
  dispose(): void;
}

export function createPausedSaver<T>(options: {
  delayMs: number;
  send: (value: T) => void | Promise<unknown>;
}): PausedSaver<T> {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let due = false; // the pause has ended for `pending`; it goes as soon as nothing is in flight

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const sendNow = () => {
    if (inFlight || pending === null) return;
    const { value } = pending;
    pending = null;
    due = false;
    inFlight = true;
    const settle = () => {
      inFlight = false;
      if (due) sendNow();
    };
    let result: void | Promise<unknown>;
    try {
      result = options.send(value);
    } catch {
      settle();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(settle, settle);
    } else {
      settle();
    }
  };

  const pauseEnded = () => {
    timer = null;
    due = true;
    sendNow();
  };

  return {
    push(value) {
      pending = { value };
      due = false;
      clearTimer();
      timer = setTimeout(pauseEnded, options.delayMs);
    },
    flush() {
      if (pending === null) return;
      clearTimer();
      due = true;
      sendNow();
    },
    busy: () => pending !== null || inFlight,
    dispose() {
      clearTimer();
      pending = null;
      due = false;
    },
  };
}
