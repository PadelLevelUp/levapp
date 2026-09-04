// react-test-renderer's act() refuses to run unless the host environment opts in
// by setting this flag. Jest sets it for you; vitest does not.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer prints a deprecation notice on every render. It is the only
// renderer that works without a DOM (and without pulling react-dom into a React
// Native app), so the notice is noise, not a signal — filter that one exact string
// and let every other console.error through.
const DEPRECATION = "react-test-renderer is deprecated.";
const baseError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith(DEPRECATION)) return;
  baseError(...args);
};

export {};
