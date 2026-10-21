/**
 * PAD-614 (delivery.api-host rule 4): where the web app reaches the API.
 *
 * Built in from VITE_API_BASE_URL (the deploy passes a repository variable; e.g.
 * `https://api.levapp.app/api`). Unset or empty means the same-origin `/api`, which is what every
 * build used before, so nothing changes until the variable is set. A trailing slash is dropped.
 */
export function resolveApiBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? "/api" : trimmed;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
