/**
 * PAD-475 — two guards of the thread's landing on a target message
 * (messaging.push-notifications rule 12b, messaging.conversation-detail rule 9b). Pure, so
 * they are testable without mounting the list.
 */
import type { OpenFetchPhase } from "./open-sequence";

/**
 * B-237: the target walk does not step while this open's own GET is in flight. A push target
 * is normally NEWER than the cached thread: stepping on the cached copy would load OLDER
 * pages for it, or give the target up, before the GET has delivered the message.
 */
export function shouldStepTarget(phase: OpenFetchPhase): boolean {
  return phase !== "in-flight";
}

/**
 * B-238: where a landing scroll that failed (an unmeasured row) is retried. The row is found
 * again by MESSAGE ID in the list as it is now: a refetch may have replaced a multi-page
 * thread with its first page in between, and the index the scroll was given is then out of
 * range. `null` drops the retry: the row is gone, or nothing is being landed on.
 */
export function retryScrollIndex(
  messages: readonly { id: string | number }[],
  messageId: string | number | null
): number | null {
  if (messageId === null) return null;
  const index = messages.findIndex((m) => String(m.id) === String(messageId));
  return index === -1 ? null : index;
}
