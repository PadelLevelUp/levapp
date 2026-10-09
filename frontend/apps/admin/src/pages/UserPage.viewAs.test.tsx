import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../i18n";
import { clearSession, storeSession, type AdminRoleName } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { UserPage } from "./UserPage";

const USER = {
  userId: 7, name: "Maria", username: "maria", email: "maria@example.com", emailVerified: true, status: "active",
  roles: ["coach"], createdAt: "2026-10-01T10:00:00+00:00", language: "pt", pushRegistered: false,
  isSuperadmin: false, adminRole: null, audit: [],
};

function renderAs(role: AdminRoleName) {
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const body = url.endsWith("/view-as") ? { url: "https://staging.levapp.app/view-as#a.b.c", expiresAt: "x", name: "Maria" } : USER;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/users/7"]}>
          <Routes>
            <Route path="/users/:userId" element={<UserPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe("view as from the console (admin.approvals-and-users rule 9)", () => {
  it("an operator opens a read-only tab on the product", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const fetchMock = renderAs("operator");
    fireEvent.click(await screen.findByTestId("admin-user-view-as"));
    await waitFor(() => expect(tab.location.href).toBe("https://staging.levapp.app/view-as#a.b.c"));
    expect(tab.opener).toBeNull();
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/view-as"));
    expect(call?.[0]).toBe("/admin/api/users/7/view-as");
  });

  it.each(["owner", "support"] as AdminRoleName[])("is not offered to %s", async (role) => {
    renderAs(role);
    expect(await screen.findByText("maria@example.com")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-user-view-as")).toBeNull();
  });
});
