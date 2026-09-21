import { useRef } from "react";

/**
 * The value as it was when `held` became true, for as long as it stays true.
 *
 * A section drawn ABOVE a form that saves on tap must not change shape in answer
 * to that tap, or the form moves under the finger and the next tap lands on
 * nothing (PAD-375: the first rating made "Evolução" appear and pushed the form
 * ~350 pt down). What is held is only what is SHOWN — the queries keep following
 * the server, and the newest value is released the moment the hold ends.
 *
 * A first load passes through (there was nothing to hold), and a change of
 * `resetKey` starts again, so one competency's figures are never held over another's.
 */
export function useHeldWhile<T>(value: T, held: boolean, resetKey?: unknown): T {
  const kept = useRef({ value, resetKey });
  if (!held || kept.current.value === undefined || kept.current.resetKey !== resetKey) {
    kept.current = { value, resetKey };
  }
  return kept.current.value;
}
