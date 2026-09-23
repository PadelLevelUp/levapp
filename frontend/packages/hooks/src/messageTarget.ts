/**
 * Opening a thread on a target message (PAD-408, messaging.push-notifications
 * rule 12). A push names the message it announces; the thread walks back
 * through older pages until that message is loaded, then scrolls to it. The
 * walk is bounded so a deleted or very old message cannot load the whole
 * history — past the bound, the thread lands where it always did, on the
 * newest message. Pure, shared by the web and native threads.
 */

/** Older pages (of `CONVERSATION_PAGE_SIZE`) a target may cost before giving up. */
export const MESSAGE_TARGET_MAX_OLDER_PAGES = 10;

export type MessageTargetStep =
  | { kind: "scroll"; index: number }
  | { kind: "load-older" }
  | { kind: "give-up" };

export function nextTargetStep(args: {
  messages: { id: string | number }[];
  targetId: string | number;
  olderPagesLoaded: number;
  hasOlder: boolean;
}): MessageTargetStep {
  const target = String(args.targetId);
  const index = args.messages.findIndex((m) => String(m.id) === target);
  if (index >= 0) return { kind: "scroll", index };
  if (args.hasOlder && args.olderPagesLoaded < MESSAGE_TARGET_MAX_OLDER_PAGES) {
    return { kind: "load-older" };
  }
  return { kind: "give-up" };
}
