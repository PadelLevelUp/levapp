/**
 * classes.coach-requests-table rules 7, 12 and criterion -23 (PAD-795b), the iOS half: the search box
 * on the Pedidos de Aula screen. It waits 200 ms after the last keystroke (players.search rule 10),
 * sends `search` with page 1, the sort and the other filters, says "searching" while it waits and
 * "nobody found" when the settled answer is empty, and keeps its text across tabs. `t` returns the key.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const row: CoachRequestRow = {
  kind: "private", id: 1, playerId: "rita-id", playerName: "Rita Gomes", nickname: "Ritinha", nicknameAsName: false,
  displayName: "Rita Gomes", coachId: "ana-id", date: "2026-10-07", startTime: "09:00", endTime: "10:00",
  classTitle: null, recurrence: null, createdAt: "2026-10-06T10:30:00+00:00", decidedAt: null, decidedBy: null,
  note: null, status: "pending", side: null, participants: [], lessonId: null, lessonInstanceId: null,
  suggestedProfileSide: null,
};
const page = (items: CoachRequestRow[]): CoachRequestsPage => ({
  items,
  pagination: { page: 1, perPage: 25, total: items.length, pages: 1, hasNext: false, hasPrev: false },
  counts: { open: items.length, history: 0 },
});

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  coachApi.listCoachRequests.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});
const sent = () => coachApi.listCoachRequests.mock.calls.map((c) => c[0]);
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("the search box on the coach's requests screen (PAD-795b)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-23] the search box debounces, resets the page and says when nobody matches", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row]));
    const n = await renderNative(
      <QueryClientProvider client={client}>
        <CoachRequestsScreen />
      </QueryClientProvider>
    );
    await n.flush();
    // The sheet's sort and kind first: the search must keep them.
    await n.press("coach-requests-filter-open");
    await n.press("coach-requests-sheet-sort-student");
    await n.press("coach-requests-sheet-dir-desc");
    await n.press("coach-requests-sheet-kind-private");
    await n.press("coach-requests-sheet-apply");
    await n.flush();
    const before = sent().length;
    expect(sent().at(-1)).toEqual({ section: "open", page: 1, sortBy: "student", sortDir: "desc", kind: "private" });
    expect(n.queryByTestId("player-search-searching")).toBeNull();
    expect(n.queryByTestId("player-search-empty")).toBeNull();

    // Typing letter by letter, faster than 200 ms apart: nothing is sent, "searching" shows, rows stay.
    coachApi.listCoachRequests.mockImplementation(async (q: { search?: string }) => (q.search === "rit" ? page([]) : page([row])));
    for (const value of ["r", "ri", "rit"]) {
      await n.changeText("coach-requests-search", value);
      await sleep(50);
    }
    expect(sent()).toHaveLength(before);
    expect(n.queryByTestId("player-search-searching")).not.toBeNull();
    expect(n.queryByTestId("coach-request-student-private-1")).not.toBeNull();

    // 200 ms after the last letter: one request, the text with page 1, the sort and the kind.
    await sleep(300);
    await n.flush();
    expect(sent()).toHaveLength(before + 1);
    expect(sent().at(-1)).toEqual({ section: "open", page: 1, sortBy: "student", sortDir: "desc", kind: "private", search: "rit" });

    // The settled answer is empty: the shared line, not the screen's own.
    expect(n.queryByTestId("player-search-empty")).not.toBeNull();
    expect(n.queryByTestId("coach-requests-empty")).toBeNull();
    expect(n.queryByTestId("player-search-searching")).toBeNull();

    // The tab keeps the text and sends it with the other section.
    await n.press("coach-requests-tab-history");
    await sleep(50);
    await n.flush();
    expect(sent().at(-1)).toMatchObject({ section: "history", page: 1, search: "rit" });
    expect(n.byTestId("coach-requests-search").props.value).toBe("rit");

    // Clearing the box drops it from the request and the "nobody" line with it.
    await n.changeText("coach-requests-search", "");
    await sleep(300);
    await n.flush();
    expect(sent().at(-1)).not.toHaveProperty("search");
    expect(n.queryByTestId("player-search-empty")).toBeNull();
  });
});
