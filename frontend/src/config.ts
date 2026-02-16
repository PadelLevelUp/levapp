export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "";

/**
 * When true, all API calls return mock data from src/data/.
 * Set VITE_USE_MOCK_DATA=true in .env or just rely on the default (true in Lovable preview).
 */
export const USE_MOCK_DATA =
  import.meta.env.VITE_USE_MOCK_DATA === "true" ||
  import.meta.env.VITE_USE_MOCK_DATA === undefined; // default to true when env var is not set
