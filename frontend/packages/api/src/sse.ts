/**
 * Builds the URL for the server-sent-events stream. The EventSource itself is
 * platform-specific (web uses the native EventSource; mobile needs a
 * polyfill), so the package only provides the URL.
 */
export function buildEventsUrl(baseURL: string, token: string): string {
  return `${baseURL}/app/events?token=${token}`;
}
