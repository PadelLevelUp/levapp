/**
 * admin.moderation (PAD-631) in the console: the reports list with Open / Closed, the detail with
 * the message in context and three actions for the operator, nothing to press for support, and
 * the deletion audit with its entity filter. The nav badge shows the open count.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Shell } from "../components/Shell";
import i18n from "../i18n";
import { clearSession, storeSession, type AdminRoleName, type ReportDetail, type ReportRow } from "../lib/api";
import { AuthProvider } from "../lib/auth";
import { DeletionAuditsPage } from "./DeletionAuditsPage";
import { ReportPage } from "./ReportPage";
import { ReportsPage } from "./ReportsPage";

interface Call {
  method: string;
  url: string;
  body: unknown;
}
type Handler = (call: Call) => { status: number; body?: unknown } | undefined;

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
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
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
            <Route element={<Shell />}>
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:reportId" element={<ReportPage />} />
              <Route path="/deletion-audits" element={<DeletionAuditsPage />} />
              <Route path="/" element={<div>home</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const person = (id: number, name: string) => ({ id, name, username: `u${id}` });
const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 7,
  createdAt: "2026-10-10T10:00:00Z",
  status: "open",
  outcome: null,
  reason: "abuso",
  closedAt: null,
  closedBy: null,
  reporter: person(11, "Rita Aluna"),
  message: { id: 40, text: "Paga-me já", deleted: false },
  author: person(12, "Carlos Treinador"),
  conversationId: 3,
  ...over,
});
const detail = (over: Partial<ReportDetail> = {}): ReportDetail => ({
  ...row(),
  context: [
    { id: 38, text: "Olá", deleted: false, senderId: 11, sentAt: "2026-10-10T09:58:00Z", reported: false },
    { id: 39, text: "Então?", deleted: true, senderId: 12, sentAt: "2026-10-10T09:59:00Z", reported: false },
    { id: 40, text: "Paga-me já", deleted: false, senderId: 12, sentAt: "2026-10-10T10:00:00Z", reported: true },
  ],
  participants: [person(11, "Rita Aluna"), person(12, "Carlos Treinador")],
  ...over,
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe("the reports list", () => {
  it("renders open reports, then closed ones when the tab is switched", async () => {
    mockApi((c) => {
      if (c.url.startsWith("/reports/summary")) return { status: 200, body: { open: 1 } };
      if (c.url.startsWith("/reports?status=open")) return { status: 200, body: { items: [row()], total: 1, hasMore: false, page: 1 } };
      if (c.url.startsWith("/reports?status=closed"))
        return {
          status: 200,
          body: {
            items: [row({ id: 8, status: "closed", outcome: "message_deleted", closedBy: "ops@levapp.app", message: { id: 41, text: "Mensagem velha", deleted: true } })],
            total: 1,
            hasMore: false,
            page: 1,
          },
        };
      return undefined;
    });
    renderAt("/reports", "support");
    const open = await screen.findByTestId("report-row-7");
    expect(within(open).getByText("Paga-me já")).toBeInTheDocument();
    expect(within(open).getByText("Carlos Treinador")).toBeInTheDocument();
    expect(within(open).getByText("Rita Aluna")).toBeInTheDocument();
    expect(within(open).getByText("abuso")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reports-tab-closed"));
    const closed = await screen.findByTestId("report-row-8");
    expect(within(closed).getByText("Message deleted")).toBeInTheDocument();
    expect(within(closed).getByText("ops@levapp.app")).toBeInTheDocument();
    expect(within(closed).getByText("Mensagem velha")).toHaveClass("line-through");
    expect(screen.queryByTestId("report-row-7")).toBeNull();
  });

  it("links a row to its detail", async () => {
    mockApi((c) => (c.url.startsWith("/reports?") ? { status: 200, body: { items: [row()], total: 1, hasMore: false, page: 1 } } : undefined));
    renderAt("/reports", "support");
    const link = await screen.findByTestId("report-link-7");
    expect(link.getAttribute("href")).toBe("/reports/7");
  });
});

describe("the report detail", () => {
  function api(extra?: Handler) {
    return mockApi((c) => {
      const r = extra?.(c);
      if (r) return r;
      if (c.url === "/reports/7") return { status: 200, body: detail() };
      if (c.url.startsWith("/reports/summary")) return { status: 200, body: { open: 1 } };
      return undefined;
    });
  }

  it("shows the context in order with the reported message marked, and links participants", async () => {
    api();
    renderAt("/reports/7", "operator");
    const marked = await screen.findByTestId("report-context-40");
    expect(marked).toHaveAttribute("data-reported", "true");
    expect(screen.getByTestId("report-context-38")).toHaveAttribute("data-reported", "false");
    expect(within(screen.getByTestId("report-context-39")).getByText("Deleted")).toBeInTheDocument();
    const order = screen.getAllByTestId(/^report-context-\d+$/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["report-context-38", "report-context-39", "report-context-40"]);
    expect(screen.getByTestId("report-participant-11").getAttribute("href")).toBe("/users/11");
    expect(screen.getByTestId("report-participant-12").getAttribute("href")).toBe("/users/12");
  });

  it("gives support no action buttons", async () => {
    api();
    renderAt("/reports/7", "support");
    await screen.findByTestId("report-context-40");
    expect(screen.queryByTestId("report-dismiss")).toBeNull();
    expect(screen.queryByTestId("report-delete-message")).toBeNull();
    expect(screen.queryByTestId("report-disable-author")).toBeNull();
  });

  it("dismisses after a confirmation and refreshes into a closed report without actions", async () => {
    let closed = false;
    api((c) => {
      if (c.method === "POST" && c.url === "/reports/7/dismiss") {
        closed = true;
        return { status: 200, body: row({ status: "closed", outcome: "dismissed", closedBy: "operator@levapp.app" }) };
      }
      if (c.url === "/reports/7" && closed) return { status: 200, body: detail({ status: "closed", outcome: "dismissed", closedBy: "operator@levapp.app" }) };
      return undefined;
    });
    renderAt("/reports/7", "operator");
    fireEvent.click(await screen.findByTestId("report-dismiss"));
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByTestId("report-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/reports/7/dismiss")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("report-dismiss")).toBeNull());
    expect(screen.getByTestId("report-outcome")).toHaveTextContent("Dismissed");
    expect(calls.filter((c) => c.method === "GET" && c.url === "/reports/7").length).toBeGreaterThanOrEqual(2);
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    api();
    renderAt("/reports/7", "operator");
    fireEvent.click(await screen.findByTestId("report-delete-message"));
    fireEvent.click(screen.getByTestId("report-cancel"));
    expect(screen.queryByTestId("report-confirm")).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("deletes the message through its own endpoint", async () => {
    api((c) => (c.method === "POST" ? { status: 200, body: row({ status: "closed", outcome: "message_deleted" }) } : undefined));
    renderAt("/reports/7", "owner");
    fireEvent.click(await screen.findByTestId("report-delete-message"));
    fireEvent.click(screen.getByTestId("report-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/reports/7/delete-message")).toBe(true));
  });

  it("requires a note to disable the author, then sends it", async () => {
    api((c) => (c.method === "POST" ? { status: 200, body: row({ status: "closed", outcome: "author_disabled" }) } : undefined));
    renderAt("/reports/7", "operator");
    fireEvent.click(await screen.findByTestId("report-disable-author"));
    const confirm = screen.getByTestId("report-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.change(screen.getByTestId("report-note"), { target: { value: "  abuso repetido  " } });
    expect(screen.getByTestId("report-confirm")).toBeEnabled();
    fireEvent.click(screen.getByTestId("report-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/reports/7/disable-author");
    expect(post.body).toEqual({ note: "abuso repetido" });
  });

  it("says the report was already handled on a 409 and refreshes", async () => {
    api((c) => (c.method === "POST" ? { status: 409, body: { code: "REPORT_CLOSED", error: "REPORT_CLOSED" } } : undefined));
    renderAt("/reports/7", "operator");
    fireEvent.click(await screen.findByTestId("report-dismiss"));
    const before = calls.filter((c) => c.url === "/reports/7").length;
    fireEvent.click(screen.getByTestId("report-confirm"));
    expect(await screen.findByTestId("report-feedback")).toHaveTextContent("already handled");
    await waitFor(() => expect(calls.filter((c) => c.url === "/reports/7" && c.method === "GET").length).toBeGreaterThan(before));
  });
});

describe("the deletion audits", () => {
  const item = (id: number, over = {}) => ({
    id,
    createdAt: "2026-10-09T10:00:00Z",
    actor: { id: 1, name: "Ana Staff", username: "ana" },
    entity: "club",
    entityId: 5,
    action: "delete",
    label: "Clube Norte",
    details: { courts: 3, lessons: 12 },
    ...over,
  });

  it("renders rows with counts and 'system' for no actor, and filters by entity on submit", async () => {
    mockApi((c) => {
      if (!c.url.startsWith("/deletion-audits")) return undefined;
      const filtered = c.url.includes("entity=club");
      return { status: 200, body: { items: filtered ? [item(1)] : [item(1), item(2, { actor: null, entity: "user", entityId: 9, label: null, details: {} })], total: 2, hasMore: false, page: 1 } };
    });
    renderAt("/deletion-audits", "support");
    const first = await screen.findByTestId("deletion-audit-row-1");
    expect(within(first).getByText("Ana Staff")).toBeInTheDocument();
    expect(within(first).getByText("Clube Norte")).toBeInTheDocument();
    expect(first).toHaveTextContent("courts: 3");
    expect(first).toHaveTextContent("lessons: 12");
    expect(within(screen.getByTestId("deletion-audit-row-2")).getByText("system")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("deletion-audits-filter-entity"), { target: { value: "club" } });
    expect(calls.some((c) => c.url.includes("entity=club"))).toBe(false);
    fireEvent.click(screen.getByTestId("deletion-audits-apply"));
    await waitFor(() => expect(screen.queryByTestId("deletion-audit-row-2")).toBeNull());
    expect(calls.some((c) => c.url.includes("entity=club"))).toBe(true);
  });
});

describe("the navigation", () => {
  it("shows the open count next to Reports when it is not zero", async () => {
    mockApi((c) => (c.url.startsWith("/reports/summary") ? { status: 200, body: { open: 3 } } : undefined));
    renderAt("/", "support");
    expect(await screen.findByTestId("admin-nav-reports-count")).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Deletions/ })).toBeInTheDocument();
  });

  it("shows no badge at zero", async () => {
    mockApi((c) => (c.url.startsWith("/reports/summary") ? { status: 200, body: { open: 0 } } : undefined));
    renderAt("/", "support");
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/reports/summary"))).toBe(true));
    expect(screen.queryByTestId("admin-nav-reports-count")).toBeNull();
    expect(screen.getByRole("link", { name: /Reports/ })).toBeInTheDocument();
  });
});
