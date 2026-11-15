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
    // PAD-745: a backend older than the receipts sends no `pushReceipts`, and the card stays away.
    expect(screen.queryByTestId("admin-eh-receipts")).toBeNull();
  });

  it("shows the push receipts by status and the errors by code (PAD-745)", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    const counts = (ok: number) => ({ pending: 1, ok, error: 1, expired: 0, errorsByCode: { InvalidCredentials: 1 } });
    mockFetch({ ...HEALTH, pushReceipts: { last24h: counts(2), last7d: counts(3) } });
    render(<App />);
    expect(await screen.findByTestId("admin-eh-receipts-24h-ok")).toHaveTextContent("2");
    expect(screen.getByTestId("admin-eh-receipts-24h-error")).toHaveTextContent("1");
    expect(screen.getByTestId("admin-eh-receipts-codes")).toHaveTextContent("InvalidCredentials 1");
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

  it("shows the push reach of active students and the failed registrations (rule 8, PAD-746)", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    mockFetch({
      ...HEALTH,
      incidents: { ...HEALTH.incidents, last24h: { ...HEALTH.incidents.last24h, push_registration_failed: 2, stream_refused: 3, push_dropped: 1 } },
      push: {
        activeStudents7d: { total: 167, noChannel: 33, webPushOnly: 19, nativeOnly: 112, nativeAndWebPush: 3 },
        registrationFailures7d: { ios: 4, android: 0, web: 1 },
      },
    });
    render(<App />);
    // The app's query cache is shared across tests: wait for THIS answer, not the cached one.
    await waitFor(() => expect(screen.getByTestId("admin-eh-push-no-channel")).toHaveTextContent("33"));
    expect(screen.getByTestId("admin-eh-push-active")).toHaveTextContent("167");
    expect(screen.getByTestId("admin-eh-push-web-only")).toHaveTextContent("19");
    expect(screen.getByTestId("admin-eh-push-native")).toHaveTextContent("115");
    expect(screen.getByTestId("admin-eh-push-failures")).toHaveTextContent("ios 4 · android 0 · web 1");
    expect(screen.getByTestId("admin-eh-incidents-24h-push_registration_failed")).toHaveTextContent("2");
    // PAD-689: minutes with refused live-update streams and with dropped pushes.
    expect(screen.getByTestId("admin-eh-incidents-24h-stream_refused")).toHaveTextContent("3");
    expect(screen.getByTestId("admin-eh-incidents-24h-push_dropped")).toHaveTextContent("1");
  });

  it("an API without the push block shows the page without it", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    mockFetch({ ...HEALTH, vacancies: { ...HEALTH.vacancies, open: 9 } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("admin-eh-vacancies-open")).toHaveTextContent("9"));
    expect(screen.queryByTestId("admin-eh-push")).toBeNull();
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

const ENGINE = {
  coaches: { old: 41, new: 2 },
  sessions: { upcoming: 18, next7Days: 9 },
  openSpots: {
    byType: [{ side: "left", levelId: 3, levelLabel: "B", open: 1 }, { side: null, levelId: null, levelLabel: null, open: 2 }],
    uncovered: 1,
  },
  invitations: {
    counting: 4, openNotCounting: 2, sentLast24h: 11,
    byTier: [{ tier: 0, counting: 1, openNotCounting: 0 }, { tier: 1, counting: 0, openNotCounting: 1 }, { tier: 2, counting: 3, openNotCounting: 2 }],
  },
  approvals: { pending: 1, dismissed: 0 },
  alerts: { byReason: [{ reason: "no_candidate", count: 1 }] },
  outbox: { pending: 3, stuckOver5Min: 5 },
  tick: { present: false, overdue: true, sessionFailures24h: 7 },
};

describe("Engine health page, the new engine's block (PAD-920)", () => {
  it("[ADMIN-ENGINE-HEALTH-29] shows the new engine's block, and no block when the summary has none", async () => {
    storeSession("tok", { email: "sup@levapp.app", role: "support", roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    window.history.pushState({}, "", "/engine-health");
    mockFetch({ ...HEALTH, engine: ENGINE });
    const { unmount } = render(<App />);
    // The app's query cache is shared across tests: wait for THIS answer, not the cached one.
    await waitFor(() => expect(screen.getByTestId("admin-eh-engine-coaches-new")).toHaveTextContent("2"));
    expect(screen.getByTestId("admin-eh-engine-coaches-old")).toHaveTextContent("41");
    expect(screen.getByTestId("admin-eh-engine-sessions-upcoming")).toHaveTextContent("18");
    expect(screen.getByTestId("admin-eh-engine-sessions-7d")).toHaveTextContent("9");
    // Open spots by type: a side and a level, or either side at any level; and the uncovered count.
    expect(screen.getByTestId("admin-eh-engine-spot-left-3")).toHaveTextContent(/(Left|Esquerda) · B: 1/);
    expect(screen.getByTestId("admin-eh-engine-spot-either-any")).toHaveTextContent(/(Either side|Qualquer lado) · (Any level|Qualquer nível): 2/);
    expect(screen.getByTestId("admin-eh-engine-spots-uncovered")).toHaveTextContent("1");
    // Invitations: counting and open-not-counting, in total and by tier.
    expect(screen.getByTestId("admin-eh-engine-invitations-counting")).toHaveTextContent("4");
    expect(screen.getByTestId("admin-eh-engine-invitations-not-counting")).toHaveTextContent("2");
    expect(screen.getByTestId("admin-eh-engine-invitations-sent-24h")).toHaveTextContent("11");
    expect(screen.getByTestId("admin-eh-engine-tier-0")).toHaveTextContent(/(Coach's list|Lista do treinador)\s*1\s*0/);
    expect(screen.getByTestId("admin-eh-engine-tier-1")).toHaveTextContent(/(Students' waiting list|Lista de espera dos alunos)\s*0\s*1/);
    expect(screen.getByTestId("admin-eh-engine-tier-2")).toHaveTextContent(/(Group|Grupo) 1\s*3\s*2/);
    expect(screen.getByTestId("admin-eh-engine-approvals-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("admin-eh-engine-approvals-dismissed")).toHaveTextContent("0");
    expect(screen.getByTestId("admin-eh-engine-alerts")).toHaveTextContent("no_candidate: 1");
    expect(screen.getByTestId("admin-eh-engine-outbox-pending")).toHaveTextContent("3");
    expect(screen.getByTestId("admin-eh-engine-outbox-stuck")).toHaveTextContent("5");
    // The tick: missing, overdue, and its failures.
    expect(screen.getByTestId("admin-eh-engine-tick-present")).toHaveTextContent(/missing|em falta/);
    expect(screen.getByTestId("admin-eh-engine-tick-overdue")).toHaveTextContent(/overdue|em atraso/);
    expect(screen.getByTestId("admin-eh-engine-tick-failures")).toHaveTextContent("7");
    unmount();

    // A summary without the block (no coach on the new engine yet) shows the page without it.
    mockFetch({ ...HEALTH, vacancies: { ...HEALTH.vacancies, open: 8 } });
    render(<App />);
    fireEvent.click(await screen.findByTestId("admin-eh-refresh"));
    await waitFor(() => expect(screen.getByTestId("admin-eh-vacancies-open")).toHaveTextContent("8"));
    expect(screen.queryByTestId("admin-eh-engine")).toBeNull();
  });
});
