/**
 * settings.save-on-change rule 3 (PAD-473): saves of one field go one at a time, so the server ends
 * in the order they were sent — which is the order SaveLedger assumes. While a request is out, a new
 * value replaces the pending one (or merges into it, for patches); when the request settles, the
 * pending value is sent. Every caller's promise settles with the outcome of the request that carried
 * its value or a later one — a value replaced before it left is never the newest save, so the ledger
 * ignores what it is told about it. Framework-free; one saver per field (or per control) per screen.
 */
/**
 * `busy()` is true while a request is out or a value waits to be sent. `drop()` discards the value
 * waiting to be sent (its callers' promises reject with `SaveSuperseded`): a keepalive send that goes
 * around the queue uses it so nothing older follows it.
 */
export type SerialSaver<T, R> = ((value: T) => Promise<R>) & {
  busy: () => boolean;
  drop: () => void;
  /** Send the waiting value at once, without waiting for the request in flight — for an app about to
   * be suspended (iOS background), where a queued request may never leave. Its callers get its outcome.
   * Limit: the request in flight may then reach the server after it. */
  sendPendingNow: () => void;
};

/** The rejection a waiting value's callers get when it is dropped and never sent. */
export class SaveSuperseded extends Error {
  constructor() {
    super("save superseded before it was sent");
  }
}

// Review #497: a value waiting in any saver is sent with whatever session is current when its turn
// comes. Signing out drops them all (dropPendingSaves), so one account's setting can never be written
// into the next account signed in on the device.
const withPending = new Set<() => void>();

/** Discard every value still waiting in any saver. Called on sign-out, by both clients. */
export function dropPendingSaves(): void {
  for (const drop of [...withPending]) drop();
}

type Waiter<R> = { resolve: (r: R) => void; reject: (e: unknown) => void };

export function createSerialSaver<T, R>(
  send: (value: T) => Promise<R>,
  merge: (pending: T, next: T) => T = (_pending, next) => next,
): SerialSaver<T, R> {
  let inFlight = false;
  let pending: { value: T; waiters: Waiter<R>[] } | null = null;

  const drop = () => {
    withPending.delete(drop);
    if (!pending) return;
    const dropped = pending;
    pending = null;
    for (const w of dropped.waiters) w.reject(new SaveSuperseded());
  };

  const start = (value: T, waiters: Waiter<R>[]) => {
    inFlight = true;
    const settle = (ok: boolean, outcome: unknown) => {
      for (const w of waiters) (ok ? w.resolve(outcome as R) : w.reject(outcome));
      inFlight = false;
      if (pending) {
        const next = pending;
        pending = null;
        withPending.delete(drop);
        start(next.value, next.waiters);
      }
    };
    let request: Promise<R>;
    try {
      request = Promise.resolve(send(value));
    } catch (e) {
      request = Promise.reject(e);
    }
    request.then((r) => settle(true, r), (e) => settle(false, e));
  };

  const sendPendingNow = () => {
    if (!pending) return;
    const now = pending;
    pending = null;
    withPending.delete(drop);
    let request: Promise<R>;
    try {
      request = Promise.resolve(send(now.value));
    } catch (e) {
      request = Promise.reject(e);
    }
    request.then(
      (r) => now.waiters.forEach((w) => w.resolve(r)),
      (e) => now.waiters.forEach((w) => w.reject(e)),
    );
  };

  const save = (value: T) =>
    new Promise<R>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (!inFlight) start(value, [waiter]);
      else if (pending) {
        pending.value = merge(pending.value, value);
        pending.waiters.push(waiter);
      } else {
        pending = { value, waiters: [waiter] };
        withPending.add(drop);
      }
    });
  return Object.assign(save, { busy: () => inFlight || pending !== null, drop, sendPendingNow });
}
