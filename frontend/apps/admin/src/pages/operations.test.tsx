import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { clearSession, storeSession, type AdminRoleName } from "../lib/api";
import { AuthProvider } from "../lib/auth";
import { ApprovalsPage } from "./ApprovalsPage";
import { SettingsPage } from "./SettingsPage";
import { UserPage } from "./UserPage";
import { UsersPage } from "./UsersPage";

interface Call {
  method: string;
  url: string;
  body: unknown;
}
type Handler = (call: Call) => { status: number; body?: unknown; raw?: string } | undefined;

let calls: Call[] = [];

function mockApi(handler: Handler) {
  calls = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input).replace("/admin/api", ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = handler(call) ?? { status: 404, body: { error: "NOT_FOUND" } };
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status: r.status });
  });
}

function renderAt(path: string, role: AdminRoleName) {
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
  clearSession();
  vi.restoreAllMocks();
});

const rui = { coachId: 7, userId: 70, name: "Rui Costa", username: "rui", email: "rui@example.com", emailVerified: false, requestedAt: "2026-10-01T10:00:00Z" };

describe("approvals page (admin.approvals-and-users rules 1, 2)", () => {
  function approvalsApi(extra?: Handler) {
    let pending = [rui];
    return mockApi((c) => {
      const custom = extra?.(c);
      if (custom) return custom;
      if (c.url === "/coach-approvals" && c.method === "GET") return { status: 200, body: { items: pending } };
      if (c.url === "/coach-approvals/7/approve") {
        pending = [];
        return { status: 200, body: { coachId: 7, approvalStatus: "approved" } };
      }
      return undefined;
    });
  }

  it("lists the pending coach; an operator approves and the list refetches", async () => {
    approvalsApi();
    renderAt("/approvals", "operator");
    expect(await screen.findByTestId("admin-approval-7")).toHaveTextContent("Rui Costa");
    expect(screen.getByTestId("admin-approval-unverified-7")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("admin-approve-7"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/coach-approvals/7/approve")).toBe(true));
    expect(await screen.findByTestId("admin-approvals-empty")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/coach-approvals" && c.method === "GET").length).toBeGreaterThanOrEqual(2);
  });

  it("support sees the list with no buttons", async () => {
    approvalsApi();
    renderAt("/approvals", "support");
    expect(await screen.findByTestId("admin-approval-7")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-approve-7")).toBeNull();
    expect(screen.queryByTestId("admin-reject-7")).toBeNull();
  });

  it("reject sends the reason", async () => {
    approvalsApi((c) => (c.url === "/coach-approvals/7/reject" ? { status: 200, body: { coachId: 7, approvalStatus: "rejected" } } : undefined));
    renderAt("/approvals", "operator");
    fireEvent.click(await screen.findByTestId("admin-reject-7"));
    fireEvent.change(screen.getByTestId("admin-reject-reason"), { target: { value: "not a coach" } });
    fireEvent.click(screen.getByTestId("admin-reject-confirm"));
    await waitFor(() => expect(calls.find((c) => c.url === "/coach-approvals/7/reject")?.body).toEqual({ reason: "not a coach" }));
  });

  it("a 410 (even with an HTML body) shows the already-decided message and refetches", async () => {
    approvalsApi((c) => (c.url === "/coach-approvals/7/approve" ? { status: 410, raw: "<html>Gone</html>" } : undefined));
    renderAt("/approvals", "operator");
    fireEvent.click(await screen.findByTestId("admin-approve-7"));
    expect(await screen.findByTestId("admin-approvals-notice")).toHaveTextContent(/already decided/i);
    await waitFor(() => expect(calls.filter((c) => c.url === "/coach-approvals" && c.method === "GET").length).toBeGreaterThanOrEqual(2));
  });
});

const row = { userId: 5, name: "João Silva", username: "joaos", email: "js@example.com", emailVerified: true, status: "active", roles: ["player"], createdAt: "2026-01-01T00:00:00Z" };

describe("users search (rule 4)", () => {
  it("a 1-character query shows the too-short message", async () => {
    mockApi(() => ({ status: 400, body: { error: "QUERY_TOO_SHORT" } }));
    renderAt("/users", "support");
    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "j" } });
    fireEvent.click(screen.getByTestId("admin-users-submit"));
    expect(await screen.findByTestId("admin-users-message")).toHaveTextContent(/at least 2/i);
  });

  it("renders results linking to the user page, and loads more with the cursor", async () => {
    mockApi((c) => {
      if (!c.url.startsWith("/users?")) return undefined;
      return c.url.includes("cursor=c2")
        ? { status: 200, body: { items: [{ ...row, userId: 6, name: "Joana Reis" }], nextCursor: null } }
        : { status: 200, body: { items: [row], nextCursor: "c2" } };
    });
    renderAt("/users", "support");
    fireEvent.change(screen.getByTestId("admin-users-search"), { target: { value: "jo" } });
    fireEvent.click(screen.getByTestId("admin-users-submit"));
    const link = await screen.findByTestId("admin-user-link-5");
    expect(link).toHaveAttribute("href", "/users/5");
    fireEvent.click(screen.getByTestId("admin-users-more"));
    expect(await screen.findByTestId("admin-user-link-6")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-users-more")).toBeNull();
  });
});

const detail = {
  ...row,
  status: "active",
  language: "pt",
  pushRegistered: true,
  isSuperadmin: false,
  adminRole: null,
  player: { playerId: 9, coaches: [{ coachId: 2, name: "Maria" }] },
  audit: [],
};

describe("user page (rules 5, 6, 7)", () => {
  function userApi(extra?: Handler) {
    return mockApi((c) => {
      const custom = extra?.(c);
      if (custom) return custom;
      if (c.url === "/users/5" && c.method === "GET") return { status: 200, body: detail };
      return undefined;
    });
  }

  it("disable needs a reason and POSTs it", async () => {
    userApi((c) => (c.url === "/users/5/disable" ? { status: 200, body: {} } : undefined));
    renderAt("/users/5", "operator");
    fireEvent.click(await screen.findByTestId("admin-user-disable"));
    expect(screen.getByTestId("admin-disable-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("admin-disable-reason"), { target: { value: "abuse report" } });
    fireEvent.click(screen.getByTestId("admin-disable-confirm"));
    await waitFor(() => expect(calls.find((c) => c.url === "/users/5/disable")?.body).toEqual({ reason: "abuse report" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/users/5" && c.method === "GET").length).toBeGreaterThanOrEqual(2));
  });

  it("RESEND_TOO_SOON shows the seconds", async () => {
    userApi((c) => (c.url === "/users/5/resend-verification" ? { status: 429, body: { error: "RESEND_TOO_SOON", retryAfterSeconds: 42 } } : undefined));
    renderAt("/users/5", "operator");
    fireEvent.click(await screen.findByTestId("admin-user-resend"));
    expect(await screen.findByTestId("admin-user-feedback")).toHaveTextContent("42 seconds");
  });

  it("support sees the account and no action buttons", async () => {
    userApi();
    renderAt("/users/5", "support");
    expect(await screen.findByTestId("admin-user-details")).toHaveTextContent("Maria");
    expect(screen.queryByTestId("admin-user-disable")).toBeNull();
    expect(screen.queryByTestId("admin-user-resend")).toBeNull();
    expect(screen.queryByTestId("admin-user-enable")).toBeNull();
  });
});

describe("settings (rule 10b)", () => {
  it("an operator toggles and the PUT carries the boolean", async () => {
    mockApi((c) => {
      if (c.url !== "/settings/coach-approval") return undefined;
      return c.method === "PUT"
        ? { status: 200, body: { coachApprovalRequired: false, source: "database" } }
        : { status: 200, body: { coachApprovalRequired: true, source: "environment" } };
    });
    renderAt("/settings", "operator");
    const toggle = await screen.findByTestId("admin-approval-switch");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ coachApprovalRequired: false }));
    await waitFor(() => expect(screen.getByTestId("admin-approval-switch")).not.toBeChecked());
  });

  it("support's switch is disabled", async () => {
    mockApi(() => ({ status: 200, body: { coachApprovalRequired: true, source: "environment" } }));
    renderAt("/settings", "support");
    expect(await screen.findByTestId("admin-approval-switch")).toBeDisabled();
  });
});
