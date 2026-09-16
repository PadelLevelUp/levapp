// PROBE ONLY: never merge. B-089 face B localisation (Session D, 2026-09-16).
// Every line goes to logcat as ReactNativeJS "B089 ...", with a monotonic
// sequence number, so a failing iteration in flow 52 can be read against the
// mount, layout and animation events around it.
let seq = 0;

export function b089(event: string, detail: Record<string, unknown> = {}): void {
  seq += 1;
  // eslint-disable-next-line no-console
  console.log(`B089 #${seq} t=${Date.now()} ${event} ${JSON.stringify(detail)}`);
}
