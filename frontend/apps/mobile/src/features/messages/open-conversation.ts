/**
 * PAD-768 (messaging.conversation-detail rule 17): a thread is always opened on top
 * of the Mensagens tab, so back — the header arrow, the iOS swipe, Android's back button — goes up
 * one level to the list, never to whatever screen or thread was open before.
 *
 * `/conversation/[id]` is a screen of the ROOT stack, above `(tabs)`; back pops that stack. Opening a
 * thread with a plain `router.push` left the previous screen under it: a push tap read inside thread
 * A put thread B on top of A, a class's "message" put the class under the thread, and a cold-start
 * push tap left the start tab under it. `openConversation` first pops the root stack back to
 * `(tabs)` with Mensagens selected (`dismissTo`, POP_TO), then pushes the thread, so the stack under
 * a thread is always exactly [(tabs) on Mensagens, thread]. Both calls go through expo-router's
 * routing queue, in order. A swipe cannot be redirected on a native stack, which is why the shape
 * of the stack, not a back handler, is the fix.
 *
 * Every navigation into a thread goes through here (the wiring test fails on a stray
 * `router.push("/conversation/…")`). `/conversation/new` is not a thread: it is opened from the list
 * and replaces itself with the thread it starts.
 */

export const MESSAGES_TAB = "/(tabs)/messages";

export type RouteTarget = string | { pathname: string; params?: Record<string, string> };

/** The router calls this module needs; expo-router's `router` and `useRouter()` both have them. */
export type ConversationRouter = {
  dismissTo: (href: never) => void;
  push: (href: never) => void;
};

export function isConversationTarget(target: RouteTarget): boolean {
  if (typeof target === "string") {
    const path = target.split("?")[0];
    return path.startsWith("/conversation/") && path !== "/conversation/new";
  }
  return target.pathname === "/conversation/[id]";
}

export function openConversation(router: ConversationRouter, target: RouteTarget): void {
  router.dismissTo(MESSAGES_TAB as never);
  router.push(target as never);
}

/** For a destination decided at run time (a push tap, a dashboard link): a thread goes through
 * `openConversation`, anything else is pushed as before. */
export function pushRoute(router: ConversationRouter, target: RouteTarget): void {
  if (isConversationTarget(target)) openConversation(router, target);
  else router.push(target as never);
}

/** The thread's header arrow: up to the list, whatever is under the thread. */
export function upFromConversation(router: ConversationRouter): void {
  router.dismissTo(MESSAGES_TAB as never);
}
