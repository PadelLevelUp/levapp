/**
 * admin.clubs-and-switches (PAD-533) in the console: support reads the switches without controls,
 * the owner switches one off with a reason, an operator unlinks a coach's last club and is warned.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import "../i18n";
import { clearSession, storeSession } from "../lib/api";

const CONFIG = { configured: true, googleClientId: "x", staffDomain: "levapp.app" };
const CAPS = [
  { capability: "open-spots", kind: "feature", off: false, reason: null, changedAt: null, changedBy: null },
  { capability: "terms-acceptance", kind: "compat", off: false, reason: null, changedAt: null, changedBy: null },
];

function signIn(role: "owner" | "operator" | "support") {
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
}

/** Routes by "METHOD path-prefix"; records every call. */
function mockFetch(routes: Record<string, { status: number; body: unknown }>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.includes(" ") ? key.split(" ") : ["GET", key];
      return m === method && url.startsWith(path);
    });
    if (!hit) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("the switches page (rules 5, 6)", () => {
  it("shows support every capability with its effect and no control", async () => {
    signIn("support");
    mockFetch({ "/admin/api/auth/config": { status: 200, body: CONFIG }, "/admin/api/settings/capabilities": { status: 200, body: { items: CAPS } } });
    window.history.pushState({}, "", "/switches");
    render(<App />);
    expect(await screen.findByTestId("switch-open-spots")).toBeInTheDocument();
    expect(screen.getByTestId("switch-owner-only-terms-acceptance")).toBeInTheDocument();
    expect(screen.queryByTestId("switch-toggle-open-spots")).toBeNull();
  });

  it("lets the owner switch a capability off with the reason typed", async () => {
    signIn("owner");
    const calls = mockFetch({
      "/admin/api/auth/config": { status: 200, body: CONFIG },
      "/admin/api/settings/capabilities": { status: 200, body: { items: CAPS } },
      "PUT /admin/api/settings/capabilities/open-spots": { status: 200, body: { items: CAPS } },
    });
    window.history.pushState({}, "", "/switches");
    render(<App />);
    fireEvent.change(await screen.findByTestId("switch-reason-open-spots"), { target: { value: "B-999 incident" } });
    fireEvent.click(screen.getByTestId("switch-toggle-open-spots"));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("/admin/api/settings/capabilities/open-spots");
    expect(put.body).toEqual({ off: true, reason: "B-999 incident" });
  });
});

describe("the club page (rules 1–3)", () => {
  const CLUB = {
    id: 7, name: "Padel Norte", description: null, location: "Porto", coaches: 1, players: 3, courts: 1, lessons: 2,
    courtsList: [{ id: 11, name: "Court 1", position: 0 }],
    coachesList: [{ coachId: 5, name: "Maria", email: "maria@example.com", linkedAt: null }],
  };

  it("lets an operator unlink a coach's last club and says so", async () => {
    signIn("operator");
    const calls = mockFetch({
      "/admin/api/auth/config": { status: 200, body: CONFIG },
      "/admin/api/clubs/7": { status: 200, body: CLUB },
      "DELETE /admin/api/clubs/7/coaches/5": { status: 200, body: { unlinked: true, warning: "COACH_HAS_NO_CLUB" } },
    });
    window.history.pushState({}, "", "/clubs/7");
    render(<App />);
    fireEvent.click(await screen.findByTestId("club-coach-unlink-5"));
    expect(await screen.findByTestId("club-notice")).toHaveTextContent(/no club|nenhum clube/);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/admin/api/clubs/7/coaches/5"))).toBe(true);
  });

  it("shows support the club read-only", async () => {
    signIn("support");
    mockFetch({ "/admin/api/auth/config": { status: 200, body: CONFIG }, "/admin/api/clubs/7": { status: 200, body: CLUB } });
    window.history.pushState({}, "", "/clubs/7");
    render(<App />);
    expect(await screen.findByTestId("club-court-11")).toBeInTheDocument();
    expect(screen.queryByTestId("club-save")).toBeNull();
    expect(screen.queryByTestId("club-coach-unlink-5")).toBeNull();
    expect(screen.getByTestId("club-field-name")).toBeDisabled();
  });
});
