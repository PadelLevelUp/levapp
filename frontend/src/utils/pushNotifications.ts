// Audit findings (Phase 1):
// - Messaging updates currently arrive via SSE while the app is open.
// - Auth token is stored in localStorage and sent as Bearer on API requests.
// - Backend JWT-protected routes already follow /api/* conventions.
const SW_PATH = "/sw.js";

export async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch("/api/notifications/vapid-public-key");
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

export async function subscribeToPush(token: string): Promise<boolean> {
  if (Notification.permission !== "granted") {
    return false;
  }

  const publicKey = await fetchVapidPublicKey();
  const registration = await getOrRegisterServiceWorker();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const response = await fetch("/api/notifications/save-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription }),
  });

  if (!response.ok) {
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
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }

  const response = await fetch("/api/notifications/unsubscribe", {
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
