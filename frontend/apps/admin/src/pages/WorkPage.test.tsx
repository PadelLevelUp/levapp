/** admin.work-dashboard (PAD-555): the page shows each source on its own (rule 1), the tickets with
 * their summaries (rule 2), where each merged PR is (rule 3), open PRs and deploys (rules 3–4),
 * asks the server to refresh only when told (rule 7), and only operators and the owner see it (6). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import "@/i18n";
import { clearSession, storeSession, type AdminRoleName, type WorkAnswer } from "@/lib/api";

const WORK: WorkAnswer = {
  fetchedAt: "2026-10-12T10:00:00Z",
  linear: {
    status: "ok",
    open: [{ id: "PAD-7", title: "Atualizar fotos", summary: "Problema: as fotos não carregam no iPhone.", state: "Todo",
             stateType: "unstarted", priority: 1, assignee: null, createdAt: "2026-10-10T00:00:00Z", url: "https://linear.app/x/PAD-7" }],
    done: [{ id: "PAD-5", title: "Feito", completedAt: "2026-10-11T00:00:00Z", url: "u5" }],
  },
  github: {
    status: "ok",
    merged: [
      { number: 10, title: "feat(PAD-10): a", url: "https://gh/10", base: "staging", mergedAt: "2026-10-11T00:00:00Z", where: "production", tickets: ["PAD-10"] },
      { number: 11, title: "feat(PAD-11): b", url: "https://gh/11", base: "staging", mergedAt: "2026-10-11T00:00:00Z", where: "staging", tickets: ["PAD-11"] },
    ],
    open: [{ number: 30, title: "feat(PAD-30): c", url: "https://gh/30", base: "staging", draft: true, checks: "failure", tickets: ["PAD-30"] }],
    deploys: {
      staging: [{ status: "completed", conclusion: "success", sha: "abcdef1", createdAt: "2026-10-11T00:00:00Z", url: "https://gh/run" }],
      production: [],
    },
  },
};

function signIn(role: AdminRoleName) {
  storeSession("tok", { email: `${role}@levapp.app`, role, roleId: 3, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
}

function mockFetch(work: unknown = WORK) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/auth/config")
      ? { configured: true, googleClientId: "x", staffDomain: "levapp.app" }
      : url.includes("/work")
        ? work
        : url.includes("/coach-approvals")
          ? { items: [] }
          : { error: "NOT_FOUND" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Work page (PAD-555)", () => {
  it("shows tickets with summaries, where each merged PR is, open PRs and deploys", async () => {
    signIn("operator");
    window.history.pushState({}, "", "/work");
    mockFetch();
    render(<App />);
    const ticket = await screen.findByTestId("admin-work-ticket-PAD-7");
    expect(ticket).toHaveTextContent("Atualizar fotos");
    expect(ticket).toHaveTextContent("Problema: as fotos não carregam no iPhone.");
    expect(screen.getByTestId("admin-work-done")).toHaveTextContent("PAD-5");
    expect(screen.getByTestId("admin-work-merged-10-where")).toHaveTextContent(/In production|Em produção/);
    expect(screen.getByTestId("admin-work-merged-11-where")).toHaveTextContent(/On staging|Em staging/);
    expect(screen.getByTestId("admin-work-open-30")).toHaveTextContent(/Checks failed|Verificações falharam/);
    expect(screen.getByTestId("admin-work-open-30")).toHaveTextContent(/Draft|Rascunho/);
    expect(screen.getByTestId("admin-work-deploys-staging")).toHaveTextContent("abcdef1");
    expect(screen.getByTestId("admin-work-deploys-production")).toHaveTextContent(/No recent deploys|Sem deploys recentes/);
  });

  it("a source not configured or unavailable says so, and the other still shows", async () => {
    signIn("owner");
    window.history.pushState({}, "", "/work");
    mockFetch({ ...WORK, linear: { status: "not_configured", missing: "LINEAR_API_KEY" }, github: { status: "unavailable", lastOkAt: null } });
    render(<App />);
    expect(await screen.findByTestId("admin-work-linear-status")).toHaveTextContent("LINEAR_API_KEY");
    expect(screen.getByTestId("admin-work-github-status")).toHaveTextContent(/Could not get the data|Não foi possível obter os dados/);
    expect(screen.queryByTestId("admin-work-ticket-PAD-7")).toBeNull();
  });

  it("asks the server to refresh only when told", async () => {
    signIn("operator");
    window.history.pushState({}, "", "/work");
    const fetchSpy = mockFetch();
    render(<App />);
    await screen.findByTestId("admin-work-ticket-PAD-7");
    const refreshes = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes("/work?refresh=1")).length;
    expect(refreshes()).toBe(0);
    fireEvent.click(screen.getByTestId("admin-work-refresh"));
    await waitFor(() => expect(refreshes()).toBe(1));
  });

  it("support has no Trabalho entry; an operator does", async () => {
    signIn("support");
    mockFetch();
    const { unmount } = render(<App />);
    const sidebar = await screen.findByTestId("admin-sidebar");
    expect(within(sidebar).queryByRole("link", { name: /^(Work|Trabalho)$/ })).toBeNull();
    unmount();
    clearSession();
    signIn("operator");
    render(<App />);
    expect(within(await screen.findByTestId("admin-sidebar")).getByRole("link", { name: /^(Work|Trabalho)$/ })).toBeInTheDocument();
  });
});
