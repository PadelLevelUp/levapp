import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import "./i18n";
import { clearSession, storeSession } from "./lib/api";

function mockFetch(routes: Record<string, { status: number; body: unknown }>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([path]) => url.startsWith(path));
    if (!hit) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].status, headers: { "Content-Type": "application/json" } });
  });
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe("the console gate (admin.foundation rules 3, 13)", () => {
  it("shows the not-configured page when the client id is empty, and calls no Google script", async () => {
    mockFetch({ "/admin/api/auth/config": { status: 200, body: { googleClientId: "", configured: false, staffDomain: "levapp.app" } } });
    render(<App />);
    expect(await screen.findByTestId("admin-not-configured")).toBeInTheDocument();
    expect(document.querySelector('script[src^="https://accounts.google.com"]')).toBeNull();
    expect(screen.queryByTestId("admin-sign-in")).toBeNull();
  });

  it("shows the sign-in page when configured and no session is stored", async () => {
    mockFetch({ "/admin/api/auth/config": { status: 200, body: { googleClientId: "client.apps.googleusercontent.com", configured: true, staffDomain: "levapp.app" } } });
    render(<App />);
    expect(await screen.findByTestId("admin-sign-in")).toBeInTheDocument();
    expect(screen.getByTestId("admin-google-button")).toBeInTheDocument();
  });

  it("opens the shell with the stored session's email and role, and support reads as read-only", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    mockFetch({ "/admin/api/auth/config": { status: 200, body: { configured: true, googleClientId: "x", staffDomain: "levapp.app" } } });
    render(<App />);
    expect(await screen.findByTestId("admin-session-email")).toHaveTextContent("sup@levapp.app");
    expect(screen.getByTestId("admin-sidebar")).toHaveTextContent("support");
    expect(screen.getByTestId("admin-sidebar")).toHaveTextContent(/Só leitura|Read only/);
  });

  it("a 401 from the API drops back to sign-in (rule 4: a revoked role ends access)", async () => {
    storeSession("tok", { email: "ana@levapp.app", role: "operator", roleId: 2, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    mockFetch({
      "/admin/api/auth/config": { status: 200, body: { configured: true, googleClientId: "x", staffDomain: "levapp.app" } },
      "/admin/api/auth/logout": { status: 401, body: { error: "ADMIN_TOKEN_REQUIRED" } },
    });
    render(<App />);
    (await screen.findByTestId("admin-sign-out")).click();
    await waitFor(() => expect(screen.getByTestId("admin-sign-in")).toBeInTheDocument());
    expect(sessionStorage.getItem("levapp-admin-token")).toBeNull();
  });
});
