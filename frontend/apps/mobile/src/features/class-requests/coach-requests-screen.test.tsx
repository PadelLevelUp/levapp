/**
 * classes.coach-requests-table (PAD-795), the iOS half: Pedidos de Aula as its own screen with compact
 * rows, two tabs with counts, a "Filtrar/Ordenar" sheet that sends the web's params, pages that load
 * at the end of the list, the actions each open row keeps, the event refresh from page 1, the row
 * detail and `proposeFor`. `t` returns the key, so ids and keys are what is asserted, never copy.
 * The hooks and react-query are real, in a real QueryClientProvider; the API and the pickers are
 * stand-ins.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { refreshAfterRequestChange } from "@levelup/hooks";
import type { CoachRequestRow, CoachRequestsPage } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
const nav = vi.hoisted(() => ({ setParams: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: vi.fn(), back: vi.fn(), setParams: nav.setParams } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The chip and its "Usar … no perfil": a Text carrying the side, and a marker when a suggestion is offered.
vi.mock("@/features/calendar/join-request-side", async () => {
  const { View, Text } = await import("react-native");
  const C = (x: unknown) => x as React.ComponentType<Record<string, unknown>>;
  return {
    JoinRequestSide: (p: { request: { side: string; playerId: string; suggestedProfileSide: string | null } }) =>
      React.createElement(C(View), { testID: `join-request-side-${p.request.playerId}` },
        React.createElement(C(Text), null, `players.side${p.request.side[0].toUpperCase()}${p.request.side.slice(1)}`),
        p.request.suggestedProfileSide ? React.createElement(C(Text), { testID: `join-request-use-side-${p.request.playerId}` }, "use") : null),
  };
});
vi.mock("@/features/calendar/busy-same-hour-toast", () => ({ busySameHourToast: () => null, showBusySameHourToast: vi.fn() }));
vi.mock("@/features/calendar/eligibility-confirm-dialog", async () => {
  const { View } = await import("react-native");
  return {
    EligibilityConfirmDialog: (p: { open: boolean; onConfirm: () => void }) =>
      p.open ? React.createElement(View as unknown as React.ComponentType<Record<string, unknown>>, { testID: "eligibility-confirm-proceed", onPress: p.onConfirm }) : null,
  };
});
const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@levelup/api/src/resources/coachRequests", () => coachApi);
const requestsApi = vi.hoisted(() => ({
  acceptClassRequest: vi.fn(async () => ({})),
  declineClassRequest: vi.fn(async () => ({})),
  proposeClassRequest: vi.fn(async () => ({})),
  classRequestRefusal: () => null,
}));
vi.mock("@levelup/api/src/resources/classRequests", () => requestsApi);
const joinApi = vi.hoisted(() => ({
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(async () => ({})),
  joinRequestRefusal: (err: unknown) => (err as { response?: { data?: unknown } })?.response?.data ?? null,
  sideGoneOf: () => null,
}));
vi.mock("@levelup/api/src/resources/classJoinRequests", () => joinApi);

// A FlatList the stub does not render: items, header and footer, plus the end-reached handler.
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const View = actual.View as React.ComponentType<Record<string, unknown>>;
  type ListProps = {
    testID?: string;
    data: unknown[];
    renderItem: (p: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown) => string;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    onEndReached?: () => void;
  };
  const FlatList = (p: ListProps) =>
    React.createElement(
      View,
      { testID: p.testID, onEndReached: p.onEndReached },
      p.ListHeaderComponent,
      p.data.length === 0 ? p.ListEmptyComponent : null,
      ...p.data.map((item, index) => React.createElement(React.Fragment, { key: p.keyExtractor ? p.keyExtractor(item) : index }, p.renderItem({ item, index }))),
      p.ListFooterComponent
    );
  return { ...actual, FlatList };
});

// The pickers are host Views carrying `value` and `onChange`, so the test can drive them.
vi.mock("@/components/ui/time-picker-input", async () => {
  const { View } = await import("react-native");
  return {
    TimePickerInput: (p: { testID?: string; value: string; onChange: (v: string) => void }) =>
      React.createElement(View as unknown as React.ComponentType<Record<string, unknown>>, { testID: p.testID, value: p.value, onChange: p.onChange }),
  };
});
vi.mock("@/components/ui/date-picker-input", async () => {
  const { View } = await import("react-native");
  return {
    DatePickerInput: (p: { testID?: string; value: string; onChange: (v: string) => void }) =>
      React.createElement(View as unknown as React.ComponentType<Record<string, unknown>>, { testID: p.testID, value: p.value, onChange: p.onChange }),
  };
});

import { CoachRequestsScreen } from "./coach-requests-screen";

function row(overrides: Partial<CoachRequestRow>): CoachRequestRow {
  return {
    kind: "private", id: 1, playerId: "bruno-id", playerName: "Bruno Alves", nickname: null, nicknameAsName: false,
    displayName: "Bruno Alves", coachId: "ana-id", date: "2026-10-07", startTime: "09:00", endTime: "10:00",
    classTitle: null, recurrence: null, createdAt: "2026-10-06T23:30:00+00:00", decidedAt: null, decidedBy: null,
    note: null, status: "pending", side: null, participants: [], lessonId: null, lessonInstanceId: null,
    suggestedProfileSide: null, ...overrides,
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

type N = Awaited<ReturnType<typeof renderNative>>;
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  coachApi.listCoachRequests.mockReset();
  nav.setParams.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

async function open(props: { proposeFor?: number | null } = {}) {
  const n = await renderNative(
    <QueryClientProvider client={client}>
      <CoachRequestsScreen {...props} />
    </QueryClientProvider>
  );
  await n.flush();
  return n;
}
const lastQuery = () => coachApi.listCoachRequests.mock.calls.at(-1)?.[0];
// Every string under the element: a Pressable's text sits two elements down.
const strings = (node: unknown): string[] =>
  typeof node === "string" ? [node] : node && typeof node === "object" && "children" in node ? ((node as { children: unknown[] | null }).children ?? []).flatMap(strings) : [];
const text = (n: N, id: string) => strings(n.byTestId(id)).join("");

describe("the coach's requests screen on iOS (PAD-795)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-18] its own screen with compact rows carrying the table's fields", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([row({ id: 1 }), academy({ id: 100, side: "left" }), academy({ id: 101, side: "both" })], { counts: { open: 3, history: 5 } })
    );
    const n = await open();

    expect(lastQuery()).toEqual({ section: "open", page: 1 });
    expect(text(n, "coach-requests-tab-open")).toContain("(3)");
    expect(text(n, "coach-requests-tab-history")).toContain("(5)");
    expect(n.byTestId("coach-requests-tab-open").props.accessibilityState).toMatchObject({ selected: true });

    const field = (id: string, name: string) => text(n, `coach-request-${name}-${id}`);
    // 23:30 UTC on 6 Oct is 00:30 on 7 Oct in the club's time zone (summer time).
    expect(field("private-1", "class")).toContain("07/10/2026");
    expect(field("private-1", "class")).toContain("09:00");
    expect(field("private-1", "requested")).toContain("07/10/2026");
    expect(field("private-1", "requested")).toContain("00:30");
    expect(field("private-1", "student")).toContain("Bruno Alves");
    expect(field("private-1", "kind")).toContain("classRequests.table.kind.private");
    expect(field("private-1", "side")).toContain("—");
    expect(field("private-1", "status")).toContain("classRequests.coachStatus.pending");
    expect(field("academy-100", "kind")).toContain("classRequests.table.kind.academy");
    expect(field("academy-100", "side")).toContain("players.sideLeft");
    expect(field("academy-101", "side")).toContain("players.sideBoth");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-18] a private proposal the student refused reads as such", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 3, status: "declined", decidedBy: "student" })]));
    const n = await open();
    expect(text(n, "coach-request-status-private-3")).toContain("classRequests.coachStatus.declinedByStudent");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-19] the sheet sends the web's params and pages load at the end", async () => {
    coachApi.listCoachRequests.mockImplementation(async (q: { page?: number }) =>
      (q.page ?? 1) === 1
        ? page([row({ id: 1 })], { pagination: { page: 1, perPage: 25, total: 30, pages: 2, hasNext: true, hasPrev: false }, counts: { open: 30, history: 4 } })
        : page([row({ id: 2 })], { pagination: { page: 2, perPage: 25, total: 30, pages: 2, hasNext: false, hasPrev: true }, counts: { open: 30, history: 4 } })
    );
    const n = await open();
    expect(n.queryByTestId("coach-request-student-private-2")).toBeNull();

    // End of the list: page 2 is requested and appended, page 1 stays.
    await act(async () => { n.byTestId("coach-requests-list").props.onEndReached(); });
    await n.flush();
    expect(lastQuery()).toMatchObject({ section: "open", page: 2 });
    expect(n.queryByTestId("coach-request-student-private-1")).not.toBeNull();
    expect(n.queryByTestId("coach-request-student-private-2")).not.toBeNull();
    // hasNext is false now: another end is no request.
    const calls = coachApi.listCoachRequests.mock.calls.length;
    await act(async () => { n.byTestId("coach-requests-list").props.onEndReached(); });
    await n.flush();
    expect(coachApi.listCoachRequests.mock.calls.length).toBe(calls);

    // The sheet: sort by student descending, kind Academia, status Marcada; apply.
    await n.press("coach-requests-tab-history");
    await n.flush();
    expect(lastQuery()).toEqual({ section: "history", page: 1 });
    await n.press("coach-requests-filter-open");
    await n.press("coach-requests-sheet-sort-student");
    await n.press("coach-requests-sheet-dir-desc");
    await n.press("coach-requests-sheet-kind-academy");
    await n.press("coach-requests-sheet-status-accepted");
    await n.press("coach-requests-sheet-apply");
    await n.flush();
    // The literal shape web sends for the same choices (its URL → the same builder), not the builder itself.
    expect(lastQuery()).toEqual({
      section: "history", page: 1, sortBy: "student", sortDir: "desc", kind: "academy", status: ["accepted"],
    });

    // A tab change drops the status filter and returns to page 1.
    await n.press("coach-requests-tab-open");
    await n.flush();
    // The tab's own default order applies: the chosen sort is dropped with the status (rule 6).
    expect(lastQuery()).toEqual({ section: "open", page: 1, kind: "academy" });
    expect(lastQuery().status).toBeUndefined();
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([row({ id: 1, status: "pending" }), row({ id: 2, status: "countered" }), academy({ id: 100, status: "pending" })])
    );
    joinApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [{ playerId: 1, name: "Carla", failures: [] }] } } })
      .mockResolvedValueOnce({});
    const n = await open();

    // The pending private row: accept, decline, propose; the countered one has none of them.
    expect(n.queryByTestId("coach-request-actions-private-1")).not.toBeNull();
    expect(n.queryByTestId("coach-request-actions-private-2")).toBeNull();
    expect(n.queryByTestId("coach-request-actions-academy-100")).not.toBeNull();

    await n.press("class-join-list-accept-100");
    await n.flush();
    await n.press("eligibility-confirm-proceed");
    await n.flush();
    expect(joinApi.acceptClassJoinRequest).toHaveBeenNthCalledWith(1, 100, false);
    expect(joinApi.acceptClassJoinRequest).toHaveBeenNthCalledWith(2, 100, true);

    await n.press("class-request-accept");
    await n.flush();
    expect(requestsApi.acceptClassRequest).toHaveBeenCalledWith(1);
    await n.press("class-request-decline");
    await n.flush();
    expect(requestsApi.declineClassRequest).toHaveBeenCalledWith(1);
    await n.press("class-join-list-reject-100");
    await n.flush();
    expect(joinApi.rejectClassJoinRequest).toHaveBeenCalledWith(100);

    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 3, status: "accepted" }), academy({ id: 101, status: "rejected" })]));
    await n.press("coach-requests-tab-history");
    await n.flush();
    expect(n.queryByTestId("coach-request-actions-private-3")).toBeNull();
    expect(n.queryByTestId("coach-request-actions-academy-101")).toBeNull();
    expect(n.queryByTestId("class-request-accept")).toBeNull();
    expect(n.queryByTestId("class-join-list-accept-101")).toBeNull();
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-16] refreshes from page 1 on request events and keeps tab, sort and filters", async () => {
    coachApi.listCoachRequests.mockImplementation(async (q: { page?: number }) =>
      (q.page ?? 1) === 1
        ? page([row({ id: 1, status: "accepted" })], { pagination: { page: 1, perPage: 25, total: 30, pages: 2, hasNext: true, hasPrev: false }, counts: { open: 0, history: 30 } })
        : page([row({ id: 2, status: "accepted" })], { pagination: { page: 2, perPage: 25, total: 30, pages: 2, hasNext: false, hasPrev: true }, counts: { open: 0, history: 30 } })
    );
    const n = await open();
    await n.press("coach-requests-tab-history");
    await n.flush();
    await n.press("coach-requests-filter-open");
    await n.press("coach-requests-sheet-sort-student");
    await n.press("coach-requests-sheet-kind-private");
    await n.press("coach-requests-sheet-apply");
    await n.flush();
    await act(async () => { n.byTestId("coach-requests-list").props.onEndReached(); });
    await n.flush();
    expect(n.queryByTestId("coach-request-student-private-2")).not.toBeNull();
    const view = { section: "history", sortBy: "student", sortDir: "asc", kind: "private" };

    for (const _event of ["class_request_changed", "join_request_created", "join_requests_superseded", "join_request_decided"]) {
      const before = coachApi.listCoachRequests.mock.calls.length;
      await act(async () => { await refreshAfterRequestChange(client); });
      await n.flush();
      expect(coachApi.listCoachRequests.mock.calls.length).toBeGreaterThan(before);
      expect(lastQuery()).toMatchObject({ ...view, page: 1 });
      // Only page 1 is shown until the list is scrolled again.
      expect(n.queryByTestId("coach-request-student-private-2")).toBeNull();
      expect(n.queryByTestId("coach-request-student-private-1")).not.toBeNull();
      await act(async () => { n.byTestId("coach-requests-list").props.onEndReached(); });
      await n.flush();
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
    const n = await open();

    await n.press("coach-request-row-private-1");
    expect(text(n, "coach-request-detail-note")).toContain("Prefiro de manhã");
    expect(text(n, "coach-request-detail-requested-at")).toContain("07/10/2026 00:30");
    expect(text(n, "coach-request-detail-decided-at")).toContain("06/10/2026 10:00"); // 09:00 UTC, club time
    expect(text(n, "coach-request-detail-decided-by")).toContain("classRequests.table.detail.student");

    await n.press("coach-request-row-academy-100");
    expect(text(n, "coach-request-detail-decided-by")).toContain("—");

    await n.press("coach-request-row-private-2");
    const recurrence = text(n, "coach-request-detail-recurrence");
    expect(recurrence).toContain("15/12/2026");
    expect(recurrence).toContain("classRequestWizard.weekdays.2");
    expect(recurrence).toContain("classRequestWizard.weekdays.4");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] proposeFor from settings lands on the screen and opens the form", async () => {
    const bruno = row({ id: 7, status: "pending", date: "2026-10-09", startTime: "17:00", endTime: "18:00" });
    coachApi.listCoachRequests.mockImplementation(async (q: { id?: number }) => (q.id ? page([bruno]) : page([row({ id: 1 })])));
    const n = await open({ proposeFor: 7 });
    expect(coachApi.listCoachRequests).toHaveBeenCalledWith(expect.objectContaining({ kind: "private", id: 7 }));
    expect(n.byTestId("class-request-proposal-date").props.value).toBe("2026-10-09");
    expect(n.byTestId("class-request-proposal-start").props.value).toBe("17:00");
    expect(coachApi.listCoachRequests).toHaveBeenCalledWith({ kind: "private", id: 7 }); // no page, no section
    expect(nav.setParams).toHaveBeenCalledWith({ proposeFor: undefined }); // the param is spent
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] the same link for a request that is not pending, or not hers, opens no form", async () => {
    for (const items of [[row({ id: 7, status: "countered" })], [row({ id: 7, status: "accepted" })], []]) {
      coachApi.listCoachRequests.mockImplementation(async (q: { id?: number }) => (q.id ? page(items) : page([row({ id: 1 })])));
      const n = await open({ proposeFor: 7 });
      expect(n.queryByTestId("class-request-proposal-date")).toBeNull();
      expect(nav.setParams).toHaveBeenCalledWith({ proposeFor: undefined });
      nav.setParams.mockClear();
    }
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-21] the propose form keeps the request's length when the start moves", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 })]));
    const n = await open();
    await n.press("class-request-propose");
    await act(async () => { n.byTestId("class-request-proposal-start").props.onChange("14:30"); });
    expect(n.byTestId("class-request-proposal-end").props.value).toBe("15:30");
    await n.press("class-request-propose-send");
    await n.flush();
    expect(requestsApi.proposeClassRequest).toHaveBeenCalledWith(1, { date: "2026-10-07", startTime: "14:30", endTime: "15:30" });
  });

  it("[CLASSES-CLASS-REQUESTS-5] after the coach sets the end, moving the start keeps the coach's length", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 })]));
    const n = await open();
    await n.press("class-request-propose");
    await act(async () => { n.byTestId("class-request-proposal-end").props.onChange("11:30"); });
    await act(async () => { n.byTestId("class-request-proposal-start").props.onChange("15:00"); });
    await n.press("class-request-propose-send");
    await n.flush();
    expect(requestsApi.proposeClassRequest).toHaveBeenCalledWith(1, { date: "2026-10-07", startTime: "15:00", endTime: "17:30" });
  });

  it("[CLASSES-CLASS-REQUESTS-5] changing the end never moves the start", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row({ id: 1 })]));
    const n = await open();
    await n.press("class-request-propose");
    await act(async () => { n.byTestId("class-request-proposal-end").props.onChange("12:00"); });
    await n.press("class-request-propose-send");
    await n.flush();
    expect(requestsApi.proposeClassRequest).toHaveBeenCalledWith(1, { date: "2026-10-07", startTime: "09:00", endTime: "12:00" });
  });

  it("[PLAYERS-NICKNAME-8] prints the display name the server resolved, never the real name beside it", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      page([
        row({ id: 1, playerName: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato" }),
        academy({ id: 100, playerName: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato" }),
      ])
    );
    const n = await open();
    expect(text(n, "coach-request-student-private-1")).toBe("Jorge chato");
    expect(text(n, "coach-request-student-academy-100")).toBe("Jorge chato");
    expect(JSON.stringify(n.root.toJSON())).not.toContain("Jorge Silva");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-19] a page that lands after the coach changed tab is dropped", async () => {
    let release!: (p: CoachRequestsPage) => void;
    coachApi.listCoachRequests.mockImplementation((q: { section: string; page?: number }) =>
      (q.page ?? 1) === 2
        ? new Promise<CoachRequestsPage>((resolve) => { release = resolve; })
        : Promise.resolve(
            q.section === "open"
              ? page([row({ id: 1 })], { pagination: { page: 1, perPage: 25, total: 30, pages: 2, hasNext: true, hasPrev: false }, counts: { open: 30, history: 1 } })
              : page([row({ id: 9, status: "accepted" })], { counts: { open: 30, history: 1 } })
          )
    );
    const n = await open();
    await act(async () => { n.byTestId("coach-requests-list").props.onEndReached(); }); // page 2 of Em aberto, in flight
    await n.press("coach-requests-tab-history");
    await n.flush();
    await act(async () => { release(page([row({ id: 2 })], { pagination: { page: 2, perPage: 25, total: 30, pages: 2, hasNext: false, hasPrev: true } })); });
    await n.flush();
    expect(n.queryByTestId("coach-request-student-private-2")).toBeNull(); // the old tab's page never joins the new list
    expect(n.queryByTestId("coach-request-student-private-9")).not.toBeNull();
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-15] the side shows once, the chip only while the request is open, never in Histórico", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([academy({ id: 100, status: "pending", side: "left", suggestedProfileSide: "left" })]));
    const n = await open();
    expect(n.queryByTestId("join-request-use-side-carla-id")).not.toBeNull();
    expect(strings(n.root.toJSON()).filter((x) => x === "players.sideLeft")).toHaveLength(1);

    coachApi.listCoachRequests.mockResolvedValue(page([academy({ id: 101, status: "accepted", side: "left", suggestedProfileSide: "left" })]));
    await n.press("coach-requests-tab-history");
    await n.flush();
    expect(n.queryByTestId("join-request-use-side-carla-id")).toBeNull();
    expect(text(n, "coach-request-side-academy-101")).toBe("players.sideLeft");
  });
});
