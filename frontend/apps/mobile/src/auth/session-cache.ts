/**
 * auth.logout rule 6 (PAD-716, B-601): the app's query cache, bound once by the root layout, so the
 * session code (sign-out, a 401, sign-in) can empty it without being a React component. The next
 * account on the device must never be served the previous account's cached answers (60 s fresh).
 */
import type { QueryClient } from "@tanstack/react-query";

let sessionClient: QueryClient | null = null;

export function bindSessionCache(client: QueryClient): void {
  sessionClient = client;
}

export function clearSessionCache(): void {
  sessionClient?.clear();
}
