/** admin.finance (PAD-742): the owner sees the months, the banner and the costs; a lower role sees
 * neither the nav item nor the page (rules 1, 5, 9, 12). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import "@/i18n";
import { clearSession, storeSession, type AdminRoleName } from "@/lib/api";

const SUMMARY = {
  categories: ["infrastructure", "ai_tools", "stores", "domains_dns", "email_crm", "other"],
  start: "2026-09",
  months: [
    { month: "2026-09", byCategory: { ai_tools: "184.37", infrastructure: "35.12" }, total: "219.49", cumulative: "219.49" },
    { month: "2026-10", byCategory: { ai_tools: "184.37" }, total: "184.37", cumulative: "403.86" },
  ],
  superseded: [],
  importStatus: {
    configured: true,
    lastRun: { outcome: "error", startedAt: "2026-10-22T04:07:00Z", finishedAt: "2026-10-22T04:07:02Z", errorCode: "PERMISSION_DENIED" },
    lastOkAt: "2026-10-20T04:07:05Z",
    stale: true,
  },
};

const COST = {
  id: 7, category: "ai_tools", vendor: "Anthropic", description: "Claude Max", currency: "USD", amount: "200.00",
  amountEur: "184.37", recurrence: "monthly", startsOn: "2026-09-03", endsOn: null, gcpInvoice: false, notes: null,
  createdByEmail: "owner@levapp.app", updatedByEmail: "owner@levapp.app", deletedAt: null, deletedByEmail: null,
  createdAt: "2026-10-22T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(onPost?: (url: string, body: unknown) => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" && onPost) return onPost(url, JSON.parse(String(init.body ?? "{}")));
    if (url.includes("/auth/config")) return json({ configured: true, googleClientId: "x", staffDomain: "levapp.app" });
    if (url.includes("/finance/summary")) return json(SUMMARY);
    if (url.includes("/finance/costs")) return json({ items: [COST] });
    if (url.includes("/finance/import-runs")) return json({ items: [] });
    if (url.includes("/finance/gcp")) return json({ month: "2026-10", items: [] });
    if (url.includes("/coach-approvals")) return json({ items: [] });
    if (url.includes("/reports/summary")) return json({ open: 0 });
    return json({ error: "NOT_FOUND" }, 404);
  });
}

function signIn(role: AdminRoleName) {
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Finance page (PAD-742)", () => {
  it("shows the months with totals and running total, the import banner and the nav item", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/finance");
    mockFetch();
    render(<App />);
    expect(await screen.findByTestId("finance-month-2026-10-total")).toHaveTextContent("184.37");
    expect(screen.getByTestId("finance-month-2026-10-cumulative")).toHaveTextContent("403.86");
    expect(screen.getByTestId("finance-month-2026-09-total")).toHaveTextContent("219.49");
    expect(screen.getByTestId("finance-import-banner")).toHaveTextContent("PERMISSION_DENIED");
    expect(screen.getByTestId("finance-chart")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Financeiro|Finance/ }).length).toBeGreaterThan(0);
  });

  it("is not there for an operator", async () => {
    signIn("operator");
    window.history.pushState({}, "", "/finance");
    const fetchSpy = mockFetch();
    render(<App />);
    expect(await screen.findByTestId("finance-not-allowed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Financeiro|Finance/ })).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/finance/"))).toBe(false);
  });

  it("says when the import is not set up", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/finance");
    SUMMARY.importStatus = { ...SUMMARY.importStatus, configured: false, stale: false };
    mockFetch();
    render(<App />);
    expect(await screen.findByTestId("finance-import-not-configured")).toBeInTheDocument();
    expect(screen.queryByTestId("finance-import-banner")).not.toBeInTheDocument();
    SUMMARY.importStatus = { ...SUMMARY.importStatus, configured: true, stale: true };
  });

  it("creates a cost and shows the field the server refuses", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/finance?tab=costs");
    const posted: unknown[] = [];
    mockFetch((_url, body) => {
      posted.push(body);
      return posted.length === 1 ? json({ error: "INVALID_COST", field: "amountEur" }, 400) : json({ ...COST, id: 8 }, 201);
    });
    render(<App />);
    expect(await screen.findByTestId("finance-cost-7")).toHaveTextContent("Anthropic");
    fireEvent.click(screen.getByTestId("finance-cost-add"));
    const form = screen.getByTestId("finance-cost-form");
    fireEvent.change(within(form).getByTestId("finance-cost-vendor"), { target: { value: "Apple" } });
    fireEvent.change(within(form).getByTestId("finance-cost-description"), { target: { value: "Developer Program" } });
    fireEvent.change(within(form).getByTestId("finance-cost-currency"), { target: { value: "usd" } });
    fireEvent.change(within(form).getByTestId("finance-cost-amount"), { target: { value: "99.00" } });
    fireEvent.change(within(form).getByTestId("finance-cost-amount-eur"), { target: { value: "91.20" } });
    fireEvent.change(within(form).getByTestId("finance-cost-starts-on"), { target: { value: "2026-03-01" } });
    fireEvent.click(within(form).getByTestId("finance-cost-save"));
    expect(await screen.findByTestId("finance-cost-error")).toHaveTextContent("amountEur");
    expect(posted[0]).toMatchObject({ vendor: "Apple", currency: "USD", amount: "99.00", amountEur: "91.20", startsOn: "2026-03-01" });
    fireEvent.click(within(form).getByTestId("finance-cost-save"));
    await waitFor(() => expect(screen.queryByTestId("finance-cost-form")).not.toBeInTheDocument());
  });

  it("asks before deleting a cost", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/finance?tab=costs");
    const fetchSpy = mockFetch();
    render(<App />);
    fireEvent.click(await screen.findByTestId("finance-cost-7-delete"));
    expect(screen.getByTestId("finance-cost-7-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("finance-cost-7-confirm-delete"));
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([u, init]) => String(u).endsWith("/finance/costs/7") && init?.method === "DELETE")).toBe(true),
    );
  });

  it("shows IMPORT_RUNNING when an import is already live", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/finance?tab=gcp");
    mockFetch(() => json({ error: "IMPORT_RUNNING" }, 409));
    render(<App />);
    fireEvent.click(await screen.findByTestId("finance-gcp-import-now"));
    expect(await screen.findByTestId("finance-gcp-import-running")).toBeInTheDocument();
  });
});
