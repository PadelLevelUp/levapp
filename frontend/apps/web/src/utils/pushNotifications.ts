import { API_BASE_URL } from "@/api/base";
// Audit findings (Phase 1):
// - Messaging updates currently arrive via SSE while the app is open.
// - Auth token is stored in localStorage and sent as Bearer on API requests.
// - Backend JWT-protected routes already follow /api/* conventions.
const SW_PATH = "/sw.js";

export async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
  if (!response.ok) {
    throw new Error("Failed to load VAPID public key");
  }
  const data = await response.json();
  return data.publicKey;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }
  return navigator.serviceWorker.register(SW_PATH);
}

// auth.push-subscription rule 8 (PAD-652, B-581): sign-in saves the subscription twice at
// once (`login()` and the token effect both call `requestAndSubscribe`). A second call for the
// same token joins the save already in flight instead of sending its own.
let inFlight: { token: string; save: Promise<boolean> } | null = null;

/**
 * PAD-746's hook (PAD-744 provides it): where a save failed. `subscribe` is the browser's
 * `pushManager.subscribe`; `post` is the save-subscription request (non-2xx or thrown).
 * `errorClass` is `http_<status>` or the error's name, at most 60 characters, never its message.
 * Permission not granted is not a failure.
 */
export type PushFailurePhase = "subscribe" | "post";
export type PushSaveFailure = { phase: PushFailurePhase; errorClass: string };

const failureListeners = new Set<(failure: PushSaveFailure) => void>();

export function onPushSaveFailure(listener: (failure: PushSaveFailure) => void): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

function reportFailure(phase: PushFailurePhase, errorClass: string): void {
  const failure = { phase, errorClass: errorClass.slice(0, 60) };
  for (const listener of failureListeners) {
    try {
      listener(failure);
    } catch {
      // A reporter must never break the save.
    }
  }
}

const nameOf = (error: unknown) => (error instanceof Error ? error.name : typeof error);

// auth.push-subscription rule 9 (PAD-744): the token this page session has already saved a
// subscription for, so the focus re-save runs once per session, not on every focus.
let savedFor: string | null = null;

export function savedThisSession(token: string): boolean {
  return savedFor === token;
}

export function subscribeToPush(token: string): Promise<boolean> {
  if (inFlight?.token === token) {
    return inFlight.save;
  }
  const save = saveSubscription(token)
    .then((saved) => {
      if (saved) savedFor = token;
      return saved;
    })
    .finally(() => {
      if (inFlight?.save === save) inFlight = null;
    });
  inFlight = { token, save };
  return save;
}

async function saveSubscription(token: string): Promise<boolean> {
  if (Notification.permission !== "granted") {
    return false;
  }

  const publicKey = await fetchVapidPublicKey();
  const registration = await getOrRegisterServiceWorker();

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  } catch (error) {
    reportFailure("subscribe", nameOf(error));
    throw error;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/notifications/save-subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription }),
    });
  } catch (error) {
    reportFailure("post", nameOf(error));
    throw error;
  }

  if (!response.ok) {
    reportFailure("post", `http_${response.status}`);
    throw new Error("Failed to save push subscription");
  }

  return true;
}

/**
 * Requests notification permission (if not already decided) and subscribes to push.
 * Safe to call silently — errors are swallowed so they don't interrupt auth flows.
 */
export async function requestAndSubscribe(token: string): Promise<void> {
  try {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    if (Notification.permission === "denied") {
      return;
    }

    if (Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return;
    }

    await subscribeToPush(token);
  } catch {
    // Don't let push subscription failures break auth flows
  }
}

export async function unsubscribeFromPush(token: string): Promise<boolean> {
  savedFor = null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }

  const response = await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error("Failed to remove push subscription");
  }

  return true;
}
