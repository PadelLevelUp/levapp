/** admin.engine-health (PAD-534): the page shows what the API answers, refreshes only on demand
 * (rule 7), and shows an unconfigured other environment as such (rule 5). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import "@/i18n";
import { clearSession, storeSession } from "@/lib/api";

const HEALTH = {
  computedAt: "2026-10-08T00:00:00Z",
  vacancies: { open: 3, byRoundAndBatch: [{ round: 1, batch: 1, count: 2 }, { round: 2, batch: 1, count: 1 }], pendingApproval: 1, oldestOpenAgeSeconds: 7200 },
  invitations: { live: 3, byRound: [{ round: 1, count: 3 }] },
  scheduler: { available: true, total: 2, byFamily: { "reminder_lesson_*": 1 }, overdue: 1, singletons: { process_batches: true, extend_schedule_window: false, prune_delivery_incidents: true } },
  incidents: { last24h: { email_failed: 1, push_failed: 0, reminder_skipped_past_due: 0 }, last7d: { email_failed: 2, push_failed: 0, reminder_skipped_past_due: 1 }, recent: [] },
  accounts: { users: { inactive: 1, active: 5, disabled: 0 }, coaches: { pending: 1, approved: 2, rejected: 0 }, players: 4, createdLast7d: 2 },
  deploy: { this: { gitSha: "abc1234def", alembicHead: "e33b118e4205" }, other: "unreachable — not configured" },
};

function mockFetch(health: unknown = HEALTH) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/auth/config")
      ? { configured: true, googleClientId: "x", staffDomain: "levapp.app" }
      : url.endsWith("/engine-health")
        ? health
        : { error: "NOT_FOUND" };
    return new Response(JSON.stringify(body), { status: body === undefined ? 404 : 200, headers: { "Content-Type": "application/json" } });
  });
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Engine health page (PAD-534)", () => {
  it("shows the engine's numbers, an overdue job, a missing singleton and an unconfigured peer", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    mockFetch();
    render(<App />);
    expect(await screen.findByTestId("admin-eh-vacancies-open")).toHaveTextContent("3");
    expect(screen.getByTestId("admin-eh-invitations-live")).toHaveTextContent("3");
    expect(screen.getByTestId("admin-eh-scheduler-overdue")).toHaveTextContent("1");
    expect(screen.getByTestId("admin-eh-scheduler")).toHaveTextContent(/missing|em falta/);
    expect(screen.getByTestId("admin-eh-incidents-24h-email_failed")).toHaveTextContent("1");
    expect(screen.getByTestId("admin-eh-deploy-this")).toHaveTextContent("abc1234def");
    expect(screen.getByTestId("admin-eh-deploy")).toHaveTextContent(/Not configured|Não configurado/);
  });

  it("refreshes only when asked", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    const fetchSpy = mockFetch();
    render(<App />);
    await screen.findByTestId("admin-eh-vacancies-open");
    const calls = () => fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/engine-health")).length;
    const button = screen.getByTestId("admin-eh-refresh");
    await waitFor(() => expect(button).not.toBeDisabled());
    const before = calls();
    await new Promise((r) => setTimeout(r, 300));
    expect(calls(), "no polling: nothing fetches by itself").toBe(before);
    fireEvent.click(button);
    await waitFor(() => expect(calls()).toBe(before + 1));
  });

  it.each([
    ["unreachable", "unreachable", /Unreachable|Inacessível/],
    ["a null identity", null, /Unreachable|Inacessível/],
    ["an identity with null fields", { gitSha: null, alembicHead: null }, /unknown/],
    ["an unexpected shape", 42, /Unreachable|Inacessível/],
  ])("a peer answering %s never breaks the page", async (_name, other, shown) => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    mockFetch({ ...HEALTH, deploy: { this: HEALTH.deploy.this, other } });
    render(<App />);
    // The app's query cache is shared across tests: wait for THIS answer, not the cached one.
    await waitFor(() => expect(screen.getByTestId("admin-eh-deploy")).toHaveTextContent(shown));
    expect(screen.getByTestId("admin-eh-vacancies-open")).toHaveTextContent("3");
  });
});
