import { getApi } from "../client";

/**
 * PAD-595: this environment's public web origin (`PUBLIC_WEB_ORIGIN`: levapp.app on prod,
 * staging.levapp.app on staging), the one every shareable link and QR code is built on.
 * `null` when the server has none configured; the caller then keeps its own origin.
 */
export async function getPublicWebOrigin(): Promise<string | null> {
  const res = await getApi().get("/app/public-web-origin");
  const origin = (res.data as { webOrigin?: string | null })?.webOrigin;
  return typeof origin === "string" && origin.trim() ? origin.trim().replace(/\/+$/, "") : null;
}
