import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { clearSession, storeSession, type AdminRoleName } from "../lib/api";
import { AuthProvider } from "../lib/auth";
import { setPhoneViewport } from "../test/phoneViewport";
import { Shell } from "./Shell";

const pendingCoach = (id: number) => ({ coachId: id, userId: id * 10, name: `Coach ${id}`, username: `c${id}`, email: `c${id}@example.com`, emailVerified: true, requestedAt: "2026-10-01T10:00:00Z" });

function renderShell(role: AdminRoleName) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input).replace("/admin/api", "");
    if (url === "/coach-approvals") return new Response(JSON.stringify({ items: [pendingCoach(1), pendingCoach(2)] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 404 });
  });
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<div>home</div>} />
              <Route path="/users" element={<div>users page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  setPhoneViewport(false);
  clearSession();
  vi.restoreAllMocks();
});

describe("phone navigation (admin.phone-console rule 2)", () => {
  it("desktop keeps the sidebar and renders no top bar or menu button", async () => {
    setPhoneViewport(false);
    renderShell("operator");
    expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-topbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-menu-button")).not.toBeInTheDocument();
  });

  it("a phone gets a top bar and a drawer with everything the sidebar carried", async () => {
    setPhoneViewport(true);
    renderShell("operator");
    expect(screen.getByTestId("admin-topbar")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-drawer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("admin-menu-button"));
    const drawer = screen.getByTestId("admin-nav-drawer");
    expect(within(drawer).getAllByRole("link")).toHaveLength(9);
    await waitFor(() => expect(within(drawer).getByText("2")).toBeInTheDocument());
    expect(within(drawer).getByTestId("admin-session-email")).toHaveTextContent("operator@levapp.app");
    expect(within(drawer).getByText("operator")).toBeInTheDocument();
    expect(within(drawer).getByTestId("admin-sign-out")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("link", { name: /Users/ }));
    expect(await screen.findByText("users page")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-drawer")).not.toBeInTheDocument();
  });

  it("the backdrop and the close control both close the drawer", () => {
    setPhoneViewport(true);
    renderShell("operator");
    fireEvent.click(screen.getByTestId("admin-menu-button"));
    fireEvent.click(screen.getByTestId("admin-menu-close"));
    expect(screen.queryByTestId("admin-nav-drawer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("admin-menu-button"));
    fireEvent.click(screen.getByTestId("admin-menu-backdrop"));
    expect(screen.queryByTestId("admin-nav-drawer")).not.toBeInTheDocument();
  });

  it("Escape closes the drawer", () => {
    setPhoneViewport(true);
    renderShell("operator");
    fireEvent.click(screen.getByTestId("admin-menu-button"));
    expect(screen.getByTestId("admin-nav-drawer")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("admin-nav-drawer")).not.toBeInTheDocument();
  });

  it("support sees the read-only badge in the drawer", () => {
    setPhoneViewport(true);
    renderShell("support");
    fireEvent.click(screen.getByTestId("admin-menu-button"));
    const drawer = screen.getByTestId("admin-nav-drawer");
    expect(within(drawer).getByText("support")).toBeInTheDocument();
    expect(within(drawer).getByText("Read only")).toBeInTheDocument();
  });
});
