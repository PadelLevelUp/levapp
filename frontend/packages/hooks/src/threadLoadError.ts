/**
 * How a failed conversation load reads (D137; messaging.push-notifications,
 * "A push opened on the wrong account says so"). A 403 means this account is not in
 * the thread — a push that reached the phone for another account (B-167), a stale
 * link, a thread the user left — so the copy names the cause, which is true in every
 * 403 case, and no retry is offered because none can succeed. Shared so the web and
 * native threads read the same.
 */
export type ThreadLoadErrorKey = "messages.conversationBelongsToAnotherAccount" | "messages.couldNotLoadConversation";

function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: unknown } } | null | undefined)?.response?.status === 403;
}

export function threadLoadErrorKey(error: unknown): ThreadLoadErrorKey {
  return isForbidden(error) ? "messages.conversationBelongsToAnotherAccount" : "messages.couldNotLoadConversation";
}

/** A retry is offered for every failure except a 403, which can never succeed. */
export function canRetryThreadLoad(error: unknown): boolean {
  return !isForbidden(error);
}
