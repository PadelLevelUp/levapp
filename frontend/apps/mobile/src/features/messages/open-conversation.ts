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
 * PAD-791 (B-713): `dismissTo` only works when the root stack holds something above `(tabs)` (a
 * class, a thread). With `(tabs)` alone, from the Mensagens list itself or from a push tap or a
 * dashboard link on another tab, the POP_TO lands on the tab navigator, which cannot handle it:
 * React Navigation logs it as unhandled (a LogBox toast over the composer in Debug) and the tab stays
 * where it was. Then there is nothing to pop, so the Mensagens tab is selected (`navigate`) instead.
 * The tabs hold no stacks of their own, so `canDismiss()` asks exactly whether the root stack can pop.
 *
 * Every navigation into a thread goes through here (the wiring test fails on a stray
 * `router.push("/conversation/…")`). `/conversation/new` is not a thread: it is opened from the list
 * and replaces itself with the thread it starts.
 */

export const MESSAGES_TAB = "/(tabs)/messages";

export type RouteTarget = string | { pathname: string; params?: Record<string, string> };

/** The router calls this module needs; expo-router's `router` and `useRouter()` both have them. */
export type ConversationRouter = {
  canDismiss: () => boolean;
  dismissTo: (href: never) => void;
  navigate: (href: never) => void;
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
  if (router.canDismiss()) router.dismissTo(MESSAGES_TAB as never);
  else router.navigate(MESSAGES_TAB as never);
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
