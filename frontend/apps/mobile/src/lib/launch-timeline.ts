/**
 * PAD-587: where the launch's time goes. `T0` is taken when this module is evaluated — it is the
 * first app import in `app/_layout.tsx`, so it is as close to "JS started" as the bundle gets.
 * Dev-only console lines, one per milestone, read from the Metro log by the measurement script.
 */
const T0 = Date.now();
const seen = new Set<string>();

export function launchMark(name: string): void {
  if (!__DEV__ || seen.has(name)) return;
  seen.add(name);
  console.log(`[launch] ${name} t=${Date.now() - T0}ms`);
}
