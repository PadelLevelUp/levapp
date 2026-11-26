/**
 * classes.coach-requests-table (PAD-795), the web half: tabs with counts, the eight columns, sort /
 * filter / pager through the URL, the actions each row keeps, the event refresh, the row detail and
 * `?proposeFor=`. Asserted by test id and by what is sent, never by copy: `t` returns the key.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isRequestEvent, refreshAfterRequestChange } from "@levelup/hooks";
import type { CoachRequestRow, CoachRequestsPage } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api/src/resources/players", async (orig) => ({
  ...(await orig<typeof import("@levelup/api/src/resources/players")>()),
  getCoachPlayers: vi.fn().mockResolvedValue([
    { id: "r1", playerId: "bruno-id", name: "Bruno Alves", displayName: "Bruno Alves" },
    { id: "r2", playerId: "carla-id", name: "Carla Dias", displayName: "Carla Dias" },
  ]),
}));

const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@/api/coachRequests", () => coachApi);
const requestsApi = vi.hoisted(() => ({
  acceptClassRequest: vi.fn(),
  declineClassRequest: vi.fn(),
  proposeClassRequest: vi.fn(),
  classRequestRefusal: () => null,
}));
vi.mock("@/api/classRequests", () => requestsApi);
const joinApi = vi.hoisted(() => ({
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  joinRequestRefusal: (err: unknown) => (err as { response?: { data?: unknown } })?.response?.data ?? null,
  sideGoneOf: () => null,
}));
vi.mock("@/api/classJoinRequests", () => joinApi);

import { CoachRequestsTable } from "./CoachRequestsTable";

function row(overrides: Partial<CoachRequestRow>): CoachRequestRow {
  return {
    kind: "private",
    id: 1,
    playerId: "bruno-id",
    playerName: "Bruno Alves",
    nickname: null,
    nicknameAsName: false,
    displayName: "Bruno Alves",
    coachId: "ana-id",
    date: "2026-10-07",
    startTime: "09:00",
    endTime: "10:00",
    classTitle: null,
    recurrence: null,
    createdAt: "2026-10-06T23:30:00+00:00",
    decidedAt: null,
    decidedBy: null,
    note: null,
    status: "pending",
    side: null,
    participants: [],
    lessonId: null,
    lessonInstanceId: null,
    suggestedProfileSide: null,
    ...overrides,
  };
}

const academy = (overrides: Partial<CoachRequestRow>) =>
  row({ kind: "academy", id: 100, playerId: "carla-id", playerName: "Carla Dias", displayName: "Carla Dias", classTitle: "Terça 18h", startTime: "18:00", endTime: "19:00", side: "left", ...overrides });

function page(items: CoachRequestRow[], extra: Partial<CoachRequestsPage> = {}): CoachRequestsPage {
  return {
    items,
    pagination: { page: 1, perPage: 25, total: items.length, pages: 1, hasNext: false, hasPrev: false },
    counts: { open: items.length, history: 0 },
    ...extra,
  };
}

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

function renderTable(url = "/class-requests") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>
        <CoachRequestsTable />
        <Where />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return client;
}

const lastQuery = () => coachApi.listCoachRequests.mock.calls.at(-1)?.[0];
const where = () => screen.getByTestId("where").textContent ?? "";

// jsdom has no scrollIntoView; the form scrolls itself into view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  for (const api of [coachApi, requestsApi, joinApi]) {
    Object.values(api).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
  }
});

describe("the coach's requests table (PAD-795)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-12] tabs with counts and the eight columns", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([row({ id: 1 }), academy({ id: 100, side: "left" }), academy({ id: 101, side: "both" })], { counts: { open: 3, history: 5 } })
    );
    renderTable();

    await screen.findAllByTestId("coach-request-row");
    expect(screen.getByTestId("coach-requests-tab-open").textContent).toContain("(3)");
    expect(screen.getByTestId("coach-requests-tab-open").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("coach-requests-tab-history").textContent).toContain("(5)");
    expect(lastQuery()).toMatchObject({ section: "open" });

    const columns = screen.getAllByTestId(/^coach-requests-col-/).map((el) => el.getAttribute("data-testid"));
    expect(columns).toEqual([
      "coach-requests-col-class-day",
      "coach-requests-col-class-time",
      "coach-requests-col-requested-day",
      "coach-requests-col-requested-time",
      "coach-requests-col-student",
      "coach-requests-col-kind",
      "coach-requests-col-side",
      "coach-requests-col-status",
      "coach-requests-col-actions",
    ]);

    const rows = screen.getAllByTestId("coach-request-row");
    const cell = (r: HTMLElement, name: string) => within(r).getByTestId(`coach-request-cell-${name}`).textContent;
    expect(cell(rows[0], "class-day")).toBe("07/10/2026"); // the language's short date (pt)
    expect(cell(rows[0], "class-time")).toBe("09:00–10:00");
    // 23:30 UTC on 6 Oct is 00:30 on 7 Oct in the club's time zone (summer time).
    expect(cell(rows[0], "requested-day")).toBe("07/10/2026");
    expect(cell(rows[0], "requested-time")).toBe("00:30");
    expect(cell(rows[0], "student")).toBe("Bruno Alves");
    expect(cell(rows[0], "kind")).toContain("classRequests.table.kind.private");
    expect(cell(rows[0], "side")).toBe("—");
    expect(cell(rows[0], "status")).toContain("classRequests.coachStatus.pending");
    expect(cell(rows[1], "kind")).toContain("classRequests.table.kind.academy");
    expect(cell(rows[1], "side")).toBe("players.sideLeft");
    expect(cell(rows[2], "side")).toBe("players.sideBoth");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-12] a private declined proposal reads as the student's refusal", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ status: "declined", decidedBy: "student" })]));
    renderTable("/class-requests?tab=history");
    const r = await screen.findByTestId("coach-request-row");
    expect(within(r).getByTestId("coach-request-cell-status").textContent).toContain("classRequests.coachStatus.declinedByStudent");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-13] sort, filters and tab reset the page and live in the URL", async () => {
    coachApi.listCoachRequests.mockImplementation(async (q: { page?: number }) => {
      const p = q.page ?? 1;
      return page([row({ id: 1, status: "accepted" })], {
        pagination: { page: p, perPage: 25, total: 75, pages: 3, hasNext: p < 3, hasPrev: p > 1 },
        counts: { open: 2, history: 9 },
      });
    });
    renderTable("/class-requests?tab=history&page=3&status=accepted");

    await screen.findByTestId("coach-request-row");
    expect(lastQuery()).toMatchObject({ section: "history", page: 3, status: ["accepted"] });
    // Every step below starts away from page 1, so "back to page 1" is the step's own doing.
    const awayFromPageOne = async () => {
      if (screen.getByTestId("coach-requests-pager-position").textContent!.startsWith("1")) {
        fireEvent.click(screen.getByTestId("coach-requests-pager-next"));
        await waitFor(() => expect(lastQuery().page).toBe(2));
      }
    };

    fireEvent.click(screen.getByTestId("coach-requests-col-student"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: "student", sortDir: "asc", page: 1, status: ["accepted"] }));
    await awayFromPageOne();
    fireEvent.click(screen.getByTestId("coach-requests-col-student"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: "student", sortDir: "desc", page: 1 }));

    await awayFromPageOne();
    fireEvent.change(screen.getByTestId("coach-requests-filter-kind"), { target: { value: "private" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ kind: "private", page: 1 }));
    await awayFromPageOne();
    fireEvent.change(screen.getByTestId("coach-requests-filter-class-from"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ classFrom: "2026-10-01", kind: "private", page: 1 }));
    expect(where()).toContain("kind=private");
    expect(where()).toContain("class_from=2026-10-01");
    expect(where()).toContain("sort_by=student");
    expect(where()).not.toContain("page=");

    await awayFromPageOne();
    expect(where()).toContain("page=2");
    fireEvent.click(screen.getByTestId("coach-requests-tab-open"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ section: "open", page: 1, kind: "private" }));
    expect(lastQuery().status).toBeUndefined();
    expect(lastQuery().sortBy).toBeUndefined(); // the tab's own default order (rule 6)
    expect(where()).not.toContain("status=");
    expect(where()).not.toContain("sort_by");
    expect(where()).not.toContain("page=");

    await awayFromPageOne();
    fireEvent.click(screen.getByTestId("coach-requests-clear"));
    await waitFor(() => expect(lastQuery().kind).toBeUndefined());
    expect(lastQuery().classFrom).toBeUndefined();
    expect(lastQuery().page).toBe(1);
    expect(where()).not.toContain("kind=");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-13] a reload of the URL requests the same view", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({})]));
    renderTable("/class-requests?tab=history&sort_by=kind&sort_dir=desc&side=none&player_id=carla-id&requested_to=2026-10-31&time_from=18:00");
    await screen.findByTestId("coach-request-row");
    expect(lastQuery()).toMatchObject({
      section: "history", sortBy: "kind", sortDir: "desc", side: "none", playerId: "carla-id",
      requestedTo: "2026-10-31", classTimeFrom: "18:00", page: 1,
    });
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-14] the pager walks the pages", async () => {
    coachApi.listCoachRequests.mockImplementation(async (q: { page?: number }) => {
      const p = q.page ?? 1;
      return page([row({ id: p })], { pagination: { page: p, perPage: 25, total: 60, pages: 3, hasNext: p < 3, hasPrev: p > 1 } });
    });
    renderTable();
    await screen.findByTestId("coach-request-row");
    const position = () => screen.getByTestId("coach-requests-pager-position").textContent;
    expect(position()).toBe("1 / 3");
    expect((screen.getByTestId("coach-requests-pager-prev") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("coach-requests-pager-next"));
    await waitFor(() => expect(position()).toBe("2 / 3"));
    fireEvent.click(screen.getByTestId("coach-requests-pager-next"));
    await waitFor(() => expect(position()).toBe("3 / 3"));
    expect((screen.getByTestId("coach-requests-pager-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("coach-requests-pager-prev"));
    await waitFor(() => expect(position()).toBe("2 / 3"));
    expect(coachApi.listCoachRequests.mock.calls.map((c) => c[0].page)).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([
        row({ id: 1, status: "pending" }),
        row({ id: 2, status: "countered" }),
        academy({ id: 100, status: "pending" }),
      ])
    );
    joinApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [{ playerId: 1, name: "Carla", failures: [] }] } } })
      .mockResolvedValueOnce({});
    renderTable();
    const rows = await screen.findAllByTestId("coach-request-row");
    const [pending, countered, acad] = rows;

    expect(within(pending).getByTestId("class-request-accept")).toBeTruthy();
    expect(within(pending).getByTestId("class-request-decline")).toBeTruthy();
    expect(within(pending).getByTestId("class-request-propose")).toBeTruthy();
    expect(within(countered).queryByTestId("class-request-accept")).toBeNull();
    expect(within(countered).queryByTestId("class-request-decline")).toBeNull();
    expect(within(countered).queryByTestId("class-request-propose")).toBeNull();
    expect(within(acad).getByTestId("class-join-list-accept")).toBeTruthy();
    expect(within(acad).getByTestId("class-join-list-reject")).toBeTruthy();

    joinApi.rejectClassJoinRequest.mockResolvedValue({});
    fireEvent.click(within(acad).getByTestId("class-join-list-reject"));
    await waitFor(() => expect(joinApi.rejectClassJoinRequest).toHaveBeenCalledWith(100));
    fireEvent.click(within(acad).getByTestId("class-join-list-accept"));
    fireEvent.click(await screen.findByTestId("eligibility-confirm-proceed"));
    await waitFor(() => expect(joinApi.acceptClassJoinRequest).toHaveBeenLastCalledWith(100, true));
    expect(joinApi.acceptClassJoinRequest).toHaveBeenCalledTimes(2);

    // Histórico: nothing, whatever the status.
    coachApi.listCoachRequests.mockResolvedValue(
      page([row({ id: 3, status: "accepted" }), academy({ id: 101, status: "rejected" }), academy({ id: 102, status: "superseded" })])
    );
    fireEvent.click(screen.getByTestId("coach-requests-tab-history"));
    await waitFor(() => expect(screen.getAllByTestId("coach-request-row")[0].getAttribute("data-status")).toBe("accepted"));
    for (const r of screen.getAllByTestId("coach-request-row")) {
      expect(within(r).queryByRole("button")).toBeNull();
    }
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-15] a pending private row is accepted and declined as today", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 })]));
    requestsApi.acceptClassRequest.mockResolvedValue({});
    requestsApi.declineClassRequest.mockResolvedValue({});
    renderTable();
    fireEvent.click(await screen.findByTestId("class-request-accept"));
    await waitFor(() => expect(requestsApi.acceptClassRequest).toHaveBeenCalledWith(1));
    fireEvent.click(await screen.findByTestId("class-request-decline"));
    await waitFor(() => expect(requestsApi.declineClassRequest).toHaveBeenCalledWith(1));
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-16] refreshes on request events and keeps the view", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1, status: "accepted" })]));
    const client = renderTable("/class-requests?tab=history&sort_by=student&kind=academy&page=2");
    await screen.findByTestId("coach-request-row");
    const view = { section: "history", sortBy: "student", kind: "academy", page: 2 };
    expect(lastQuery()).toMatchObject(view);

    for (const type of ["class_request_changed", "join_request_created", "join_requests_superseded", "join_request_decided"]) {
      expect(isRequestEvent(type)).toBe(true);
      const before = coachApi.listCoachRequests.mock.calls.length;
      await refreshAfterRequestChange(client);
      await waitFor(() => expect(coachApi.listCoachRequests.mock.calls.length).toBeGreaterThan(before));
      expect(lastQuery()).toMatchObject(view);
    }
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-17] a row opens its detail", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([
        row({ id: 1, status: "declined", decidedBy: "student", note: "Prefiro de manhã", decidedAt: "2026-10-06T09:00:00+00:00" }),
        academy({ id: 100, status: "accepted", decidedBy: null, decidedAt: "2026-10-06T10:00:00+00:00" }),
        row({ id: 2, recurrence: { weekdays: [2, 4], startDate: "2026-10-06", endDate: "2026-12-15" } }),
      ])
    );
    renderTable("/class-requests?tab=history");
    const rows = await screen.findAllByTestId("coach-request-row");

    fireEvent.click(rows[0]);
    let detail = await screen.findByTestId("coach-request-detail");
    expect(detail.getAttribute("data-request-id")).toBe("1");
    expect(within(detail).getByTestId("coach-request-detail-note").textContent).toContain("Prefiro de manhã");
    expect(within(detail).getByTestId("coach-request-detail-requested-at").textContent).toContain("07/10/2026 00:30");
    expect(within(detail).getByTestId("coach-request-detail-decided-at").textContent).toContain("06/10/2026 10:00"); // 09:00 UTC, club time
    expect(within(detail).getByTestId("coach-request-detail-decided-by").textContent).toContain("classRequests.table.detail.student");

    fireEvent.click(rows[1]);
    detail = await screen.findByTestId("coach-request-detail");
    expect(detail.getAttribute("data-request-id")).toBe("100");
    expect(within(detail).getByTestId("coach-request-detail-decided-by").textContent).toBe("classRequests.table.detail.decidedBy:{\"who\":\"—\"}");

    fireEvent.click(rows[2]);
    detail = await screen.findByTestId("coach-request-detail");
    const recurrence = within(detail).getByTestId("coach-request-detail-recurrence").textContent ?? "";
    expect(recurrence).toContain("15/12/2026");
    expect(recurrence).toContain("classRequestWizard.weekdays.2");
    expect(recurrence).toContain("classRequestWizard.weekdays.4");
    // Nothing in it is editable.
    expect(within(detail).queryByRole("textbox")).toBeNull();
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] proposeFor opens the form on a request on any page", async () => {
    const bruno = row({ id: 7, status: "pending", date: "2026-10-09", startTime: "17:00", endTime: "18:00" });
    coachApi.listCoachRequests.mockImplementation(async (q: { id?: number }) =>
      q.id ? page([bruno]) : page([row({ id: 1 })], { pagination: { page: 1, perPage: 25, total: 60, pages: 3, hasNext: true, hasPrev: false } })
    );
    renderTable("/class-requests?proposeFor=7");

    const form = await screen.findByTestId("class-request-proposal-form");
    expect(coachApi.listCoachRequests).toHaveBeenCalledWith({ kind: "private", id: 7 }); // no page, no section
    expect((within(form).getByDisplayValue("2026-10-09") as HTMLInputElement).type).toBe("date");
    await waitFor(() => expect(where()).not.toContain("proposeFor"));
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] the same link for a request that is not pending, or not hers, opens no form", async () => {
    for (const items of [[row({ id: 7, status: "countered" })], [row({ id: 7, status: "accepted" })], []]) {
      coachApi.listCoachRequests.mockImplementation(async (q: { id?: number }) => (q.id ? page(items) : page([row({ id: 1 })])));
      renderTable("/class-requests?proposeFor=7");
      await waitFor(() => expect(where()).not.toContain("proposeFor"));
      expect(screen.queryByTestId("class-request-proposal-form")).toBeNull();
      cleanup();
    }
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] the propose form sends the coach's slot from the row's button too", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 })]));
    requestsApi.proposeClassRequest.mockResolvedValue({});
    renderTable();
    fireEvent.click(await screen.findByTestId("class-request-propose"));
    await screen.findByTestId("class-request-proposal-form");
    fireEvent.click(screen.getByTestId("class-request-propose-send"));
    await waitFor(() =>
      expect(requestsApi.proposeClassRequest).toHaveBeenCalledWith(1, { date: "2026-10-07", startTime: "09:00", endTime: "10:00" })
    );
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-15] \"use this side in the profile\" is offered while a request is open, never in Histórico", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([academy({ id: 100, status: "pending", side: "left", suggestedProfileSide: "left" })]));
    renderTable();
    await screen.findByTestId("class-join-request-use-side");
    cleanup();
    coachApi.listCoachRequests.mockResolvedValue(page([academy({ id: 101, status: "accepted", side: "left", suggestedProfileSide: "left" })]));
    renderTable("/class-requests?tab=history");
    const r = await screen.findByTestId("coach-request-row");
    expect(within(r).queryByTestId("class-join-request-use-side")).toBeNull();
    expect(within(r).getByTestId("coach-request-cell-side").textContent).toBe("players.sideLeft");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] the propose form opens under its own row, and above the list only when the row is not loaded", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 }), row({ id: 2, playerId: "carla-id", displayName: "Carla Dias" })]));
    renderTable();
    const rows = await screen.findAllByTestId("coach-request-row");
    fireEvent.click(within(rows[1]).getByTestId("class-request-propose"));
    const form = await screen.findByTestId("class-request-proposal-form");
    // The form is the next table row after the row it is for, not the top of the card.
    expect(form.closest("tr")).toBe(rows[1].nextElementSibling);
    expect(form.getAttribute("data-request-id")).toBe("2");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-12] the actions are Accept and a menu holding the rest", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 }), academy({ id: 100 })]));
    renderTable();
    const [priv, acad] = await screen.findAllByTestId("coach-request-row");
    for (const r of [priv, acad]) expect(within(r).getByTestId("coach-request-more-toggle").getAttribute("aria-label")).toBe("classRequests.table.moreActions");
    const menu = (r: HTMLElement) => within(within(r).getByTestId("coach-request-more")).queryAllByRole("button").map((b) => b.getAttribute("data-testid"));
    expect(menu(priv)).toEqual(["class-request-decline", "class-request-propose"]);
    expect(menu(acad)).toEqual(["class-join-list-reject"]);
    // Accept is outside the menu.
    expect(within(within(priv).getByTestId("coach-request-more")).queryByTestId("class-request-accept")).toBeNull();
  });
});
