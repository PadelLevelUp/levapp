/**
 * classes.class-requests rule 20 (PAD-491) on iOS: in the coach's "propose another time" form,
 * changing the start moves the end so the form keeps its length; changing the end never moves
 * the start. The rule is unit-tested in @levelup/config (proposalAfterStartChange); this pins the
 * form's wiring, through what is sent. react-query, the API and the pickers are stand-ins (the
 * mobile harness cannot mount react-query against the app's React copy).
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/calendar/eligibility-confirm-dialog", () => ({ EligibilityConfirmDialog: () => null }));

const PENDING = {
  id: 7,
  playerId: "bruno-id",
  playerName: "Bruno",
  coachId: "ana-id",
  coachName: "Ana",
  date: "2026-10-07",
  startTime: "10:00",
  endTime: "11:00",
  note: null,
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  lessonId: null,
  createdAt: "2026-10-06T12:00:00",
  participants: [],
  recurrence: null,
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === "class-requests" ? [PENDING] : [],
    isLoading: false,
    isError: false,
  }),
  useMutation: (opts: { mutationFn: (v: unknown) => Promise<unknown> }) => ({
    mutate: (v: unknown) => void opts.mutationFn(v),
    isPending: false,
  }),
}));

const api = vi.hoisted(() => ({
  proposeClassRequest: vi.fn(async () => ({})),
  listClassRequests: vi.fn(async () => []),
  classRequestRefusal: () => null,
}));
vi.mock("@levelup/api/src/resources/classRequests", () => api);
vi.mock("@levelup/api/src/resources/classJoinRequests", () => ({ listClassJoinRequests: vi.fn(async () => []) }));

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

import { act } from "react-test-renderer";
import { ClassRequestsSection } from "./class-requests-section";

type N = Awaited<ReturnType<typeof renderNative>>;
const pick = (n: N, id: string, v: string) => act(async () => { n.byTestId(id).props.onChange(v); });

async function openForm() {
  const n = await renderNative(<ClassRequestsSection role="coach" />);
  await n.press("class-request-propose");
  return n;
}

async function sent(n: N) {
  await n.press("class-request-propose-send");
  await n.flush();
  return api.proposeClassRequest.mock.calls[0];
}

afterEach(() => api.proposeClassRequest.mockClear());

describe("propose another time keeps the length on iOS (PAD-491, rule 20)", () => {
  it("moving the start moves the end by the request's length", async () => {
    const n = await openForm();
    await pick(n, "class-request-proposal-start", "14:30");
    expect(n.byTestId("class-request-proposal-end").props.value).toBe("15:30");
    expect(await sent(n)).toEqual([7, { date: "2026-10-07", startTime: "14:30", endTime: "15:30" }]);
  });

  it("after the coach sets the end, moving the start keeps the coach's length", async () => {
    const n = await openForm();
    await pick(n, "class-request-proposal-end", "11:30");
    await pick(n, "class-request-proposal-start", "15:00");
    expect(await sent(n)).toEqual([7, { date: "2026-10-07", startTime: "15:00", endTime: "16:30" }]);
  });

  it("changing the end never moves the start", async () => {
    const n = await openForm();
    await pick(n, "class-request-proposal-end", "12:00");
    expect(await sent(n)).toEqual([7, { date: "2026-10-07", startTime: "10:00", endTime: "12:00" }]);
  });
});
