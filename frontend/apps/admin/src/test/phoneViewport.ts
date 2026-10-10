// Flips the matchMedia stub installed by setup.ts: true = a phone-width viewport.
// Call before rendering; the stub reads the flag on every query.
export function setPhoneViewport(matches: boolean) {
  window.__phoneViewport = matches;
}
