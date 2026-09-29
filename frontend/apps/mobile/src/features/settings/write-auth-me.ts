import type { QueryClient } from "@tanstack/react-query";

export const AUTH_ME_KEY = ["auth-me"] as const;

/**
 * B-185 (PAD-454): write the server's answer to a profile save into the ["auth-me"] cache.
 *
 * An ["auth-me"] fetch that started before the save (the section's own read, a focus refetch)
 * answers with the profile as it was. `setQueryData` alone does not stop it: when it lands,
 * react-query writes that older answer over the saved one, and the picker, which follows the
 * cache, shows the old language again while the server and i18n hold the new one. Cancel
 * whatever is in flight first; the save's own answer is the newest truth.
 */
export async function writeAuthMe<T>(queryClient: QueryClient, updated: T): Promise<T> {
  await queryClient.cancelQueries({ queryKey: AUTH_ME_KEY });
  queryClient.setQueryData(AUTH_ME_KEY, updated);
  return updated;
}
