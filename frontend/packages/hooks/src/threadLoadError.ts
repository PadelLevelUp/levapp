/**
 * Which message a failed conversation load shows (D137; messaging.push-notifications,
 * "A push opened on the wrong account says so"). A 403 means this account is not in
 * the thread — typically a push that reached the phone for another account (B-167);
 * saying so beats a generic "couldn't load" the user can only retry. Shared so the
 * web and native threads word it the same way.
 */
export type ThreadLoadErrorKey = "messages.notificationForAnotherAccount" | "messages.couldNotLoadConversation";

export function threadLoadErrorKey(error: unknown): ThreadLoadErrorKey {
  const status = (error as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  return status === 403 ? "messages.notificationForAnotherAccount" : "messages.couldNotLoadConversation";
}
