/**
 * auth.push-subscription rule 13 (PAD-789 item 3; admin.engine-health rule 8e): tell the server
 * when this browser's notification permission is refused, as a state, so the engine health page
 * can count it. One reporter for the signed-in user, started at the app shell.
 *
 * Reports when the permission changes into `denied` since the last state this browser reported
 * for this user, and again after PUSH_REFUSAL_RESEND_DAYS while still denied. The memory is
 * written only after a 2xx; a failed post is dropped and sent again at the next page load, never
 * on each read. Closed fields only; sent with the user's token through `fetch`, outside the API
 * client, so a report never signs the user out.
 */
import { API_BASE_URL } from "@/api/base";
import { webTokenStorage } from "@/api/client";

export const REFUSAL_PATH = "/notifications/registration-failure";
/** const:PUSH_REFUSAL_RESEND_DAYS (specflow/impl/constants.md). */
export const PUSH_REFUSAL_RESEND_DAYS = 3;
const DAY_MS = 86_400_000;

const memoryKey = (userId: number) => `pushRefusalReport:${userId}`;

/** Users with a post in flight, or one that failed or whose memory cannot be written: one per page. */
const heldThisPage = new Set<number>();

function readMemory(userId: number): number | null | "unreadable" {
  try {
    const raw = localStorage.getItem(memoryKey(userId));
    const at = raw === null ? null : Number(raw);
    return at === null || Number.isNaN(at) ? null : at;
  } catch {
    return "unreadable";
  }
}

function writeMemory(userId: number, at: number | null): boolean {
  try {
    if (at === null) localStorage.removeItem(memoryKey(userId));
    else localStorage.setItem(memoryKey(userId), String(at));
    return true;
  } catch {
    return false;
  }
}

async function post(): Promise<boolean> {
  try {
    const token = await webTokenStorage.getToken();
    if (!token) return false;
    const response = await fetch(`${API_BASE_URL}${REFUSAL_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: "web", phase: "refused", permission: "denied", build: "web" }),
    });
    return response.ok;
  } catch {
    return false; // dropped: a diagnostic, never a reason to fail or retry anything
  }
}

async function check(userId: number): Promise<void> {
  if (typeof Notification === "undefined") return; // no Notification API: nothing to report
  if (Notification.permission !== "denied") {
    if (!heldThisPage.has(userId)) writeMemory(userId, null); // granted or default resets it
    return;
  }
  if (heldThisPage.has(userId)) return;
  const memory = readMemory(userId);
  if (typeof memory === "number" && Date.now() - memory < PUSH_REFUSAL_RESEND_DAYS * DAY_MS) return;
  heldThisPage.add(userId);
  const ok = await post();
  if (ok && writeMemory(userId, Date.now())) heldThisPage.delete(userId);
}

/** Starts reporting for this user; returns the function that stops it. */
export function startPushRefusalReport(userId: number): () => void {
  const read = () => void check(userId).catch(() => undefined);
  read();
  window.addEventListener("focus", read);
  document.addEventListener("visibilitychange", read);
  return () => {
    window.removeEventListener("focus", read);
    document.removeEventListener("visibilitychange", read);
  };
}
