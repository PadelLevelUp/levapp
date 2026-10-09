/**
 * PAD-532 review finding 2: a push whose url is on another origin (the staff console, for the
 * pending-coach alert) must open a NEW window; it must never navigate the user's open LevApp
 * tab away. A same-origin push keeps focusing and navigating the open tab, as before.
 * Runs the real public/sw.js with a fake service-worker global.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SW = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");

async function click(url: string) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const client = { navigate: vi.fn(), focus: vi.fn(async () => client) };
  const clients = { matchAll: vi.fn(async () => [client]), openWindow: vi.fn(async () => null) };
  let done: Promise<unknown> = Promise.resolve();
  const self = {
    location: { origin: "https://levapp.app" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    registration: { showNotification: vi.fn() },
    skipWaiting: vi.fn(),
    clients,
  };
  runInNewContext(SW, { self, clients, URL, console, Promise });
  handlers.notificationclick({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (p: Promise<unknown>) => (done = p),
  });
  await done;
  return { client, clients };
}

describe("push click (sw.js)", () => {
  it("opens another origin in a new window and leaves the open tab alone", async () => {
    const { client, clients } = await click("https://admin.levapp.app/approvals");
    expect(clients.openWindow).toHaveBeenCalledWith("https://admin.levapp.app/approvals");
    expect(client.navigate).not.toHaveBeenCalled();
  });

  it("still focuses and navigates the open tab for a same-origin path", async () => {
    const { client, clients } = await click("/players");
    expect(client.navigate).toHaveBeenCalledWith("/players");
    expect(clients.openWindow).not.toHaveBeenCalled();
  });
});
