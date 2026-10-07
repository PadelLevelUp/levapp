import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../i18n";
import { AuthProvider } from "@/lib/auth";
import { SignInPage } from "./SignInPage";

const config = { googleClientId: "client.apps.googleusercontent.com", configured: true, staffDomain: "levapp.app" };

afterEach(() => vi.restoreAllMocks());

function renderPage(fetchStatus: number, body: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: fetchStatus, headers: { "Content-Type": "application/json" } }));
  let deliver: ((credential: string) => void) | null = null;
  const fakeRender = vi.fn(async (_el: HTMLElement, clientId: string, onCredential: (c: string) => void) => {
    expect(clientId).toBe(config.googleClientId);
    deliver = onCredential;
  });
  render(
    <AuthProvider>
      <SignInPage config={config} render={fakeRender} />
    </AuthProvider>,
  );
  return { fakeRender, deliver: () => deliver!("google-credential") };
}

describe("sign-in page (admin.foundation rules 1, 2)", () => {
  it("renders the Google button with the configured client id", async () => {
    const { fakeRender } = renderPage(200, {});
    await waitFor(() => expect(fakeRender).toHaveBeenCalledTimes(1));
  });

  it("a personal account sees the domain message", async () => {
    const { fakeRender, deliver } = renderPage(403, { error: "NOT_STAFF_DOMAIN" });
    await waitFor(() => expect(fakeRender).toHaveBeenCalled());
    await act(async () => deliver());
    expect(await screen.findByTestId("admin-sign-in-error")).toHaveTextContent(/@levapp\.app/);
  });

  it("a domain account without a role sees the no-role message", async () => {
    const { fakeRender, deliver } = renderPage(403, { error: "NO_ADMIN_ROLE" });
    await waitFor(() => expect(fakeRender).toHaveBeenCalled());
    await act(async () => deliver());
    expect(await screen.findByTestId("admin-sign-in-error")).toHaveTextContent(/owner/);
  });

  it("the credential goes to the backend, never anywhere else", async () => {
    const { fakeRender, deliver } = renderPage(200, { token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString(), role: "operator", email: "ana@levapp.app", roleId: 1 });
    await waitFor(() => expect(fakeRender).toHaveBeenCalled());
    await act(async () => deliver());
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/admin/api/auth/google");
    expect(JSON.parse(String(call[1].body))).toEqual({ credential: "google-credential" });
    await waitFor(() => expect(sessionStorage.getItem("levapp-admin-token")).toBe("t"));
    sessionStorage.clear();
  });
});
