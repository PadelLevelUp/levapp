/**
 * settings.explicit-save rule 5 (#550 review F3): leaving through code, not a link — the avatar menu's
 * "Terminar sessão" — asks first while Settings holds an unsaved edit. Settings registers a guard while
 * anything is unsaved; `guardedLeave` gives the guard the chance to ask (it returns true when it took
 * over and will call `proceed` on Discard), else leaves at once.
 */
type LeaveGuard = (proceed: () => void) => boolean;

let guard: LeaveGuard | null = null;

export function setLeaveGuard(next: LeaveGuard | null): void {
  guard = next;
}

export function guardedLeave(proceed: () => void): void {
  if (guard && guard(proceed)) return;
  proceed();
}
