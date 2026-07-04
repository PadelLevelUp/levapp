/**
 * API base URL. The iOS simulator shares the Mac's network, so localhost
 * reaches the Flask dev server directly. Override per environment with
 * EXPO_PUBLIC_API_URL (e.g. a LAN IP for physical devices).
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5001/api";
