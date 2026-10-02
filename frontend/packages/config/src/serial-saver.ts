/**
 * settings.save-on-change rule 3 (PAD-473): saves of one field go one at a time, so the server ends
 * in the order they were sent — which is the order SaveLedger assumes. While a request is out, a new
 * value replaces the pending one (or merges into it, for patches); when the request settles, the
 * pending value is sent. Every caller's promise settles with the outcome of the request that carried
 * its value or a later one — a value replaced before it left is never the newest save, so the ledger
 * ignores what it is told about it. Framework-free; one saver per field (or per control) per screen.
 */
/** `busy()` is true while a request is out or a value waits to be sent. */
export type SerialSaver<T, R> = ((value: T) => Promise<R>) & { busy: () => boolean };

type Waiter<R> = { resolve: (r: R) => void; reject: (e: unknown) => void };

export function createSerialSaver<T, R>(
  send: (value: T) => Promise<R>,
  merge: (pending: T, next: T) => T = (_pending, next) => next,
): SerialSaver<T, R> {
  let inFlight = false;
  let pending: { value: T; waiters: Waiter<R>[] } | null = null;

  const start = (value: T, waiters: Waiter<R>[]) => {
    inFlight = true;
    const settle = (ok: boolean, outcome: unknown) => {
      for (const w of waiters) (ok ? w.resolve(outcome as R) : w.reject(outcome));
      inFlight = false;
      if (pending) {
        const next = pending;
        pending = null;
        start(next.value, next.waiters);
      }
    };
    let request: Promise<R>;
    try {
      request = send(value);
    } catch (e) {
      request = Promise.reject(e);
    }
    request.then((r) => settle(true, r), (e) => settle(false, e));
  };

  const save = (value: T) =>
    new Promise<R>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (!inFlight) start(value, [waiter]);
      else if (pending) {
        pending.value = merge(pending.value, value);
        pending.waiters.push(waiter);
      } else pending = { value, waiters: [waiter] };
    });
  return Object.assign(save, { busy: () => inFlight || pending !== null });
}
