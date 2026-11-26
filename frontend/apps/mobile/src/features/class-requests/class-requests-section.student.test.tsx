/**
 * The student's requests list on iOS (Availability), untouched by the coach's requests screen
 * (classes.coach-requests-table, PAD-795): it keeps the two old reads and the waiting list, shows
 * the coach and never a roster name (players.nickname rule 8, PAD-660), and never calls the
 * coach's endpoint. The hooks are the real @levelup/hooks (PAD-406), in a real QueryClientProvider,
 * over api spies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { name?: string }) => (o?.name ? `${key}|${o.name}` : key) }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/calendar/eligibility-confirm-dialog", () => ({ EligibilityConfirmDialog: () => null }));

vi.mock("@/components/ui/time-picker-input", () => ({ TimePickerInput: () => null }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));

const getCoachPlayers = vi.hoisted(() => vi.fn());
const listCoachRequests = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/coachRequests", () => ({ listCoachRequests }));
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: (...a: unknown[]) => getCoachPlayers(...a),
}));

const base = {
  playerId: "jorge-id",
  playerName: "Jorge Silva",
  coachId: "ana-id",
  coachName: "Ana",
  date: "2026-10-07",
  startTime: "10:00",
  endTime: "11:00",
  note: null,
  decidedBy: null,
  decidedAt: null,
  lessonId: null,
  createdAt: "2026-10-06T12:00:00",
};
const PRIVATE = { ...base, id: 7, status: "pending", participants: [], recurrence: null };
const ACADEMY = { ...base, id: 9, kind: "academy", status: "pending", classTitle: "Peak", lessonInstanceId: "5" };

vi.mock("@levelup/api/src/resources/classRequests", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listClassRequests: async () => [PRIVATE],
  classRequestRefusal: () => null,
}));
vi.mock("@levelup/api/src/resources/classJoinRequests", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listClassJoinRequests: async () => [ACADEMY],
}));
vi.mock("@levelup/api/src/resources/academyClasses", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listClassWaitingList: async () => [],
}));

import { ClassRequestsSection } from "./class-requests-section";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  getCoachPlayers.mockReset().mockResolvedValue([{ playerId: "jorge-id", name: "Jorge Silva", displayName: "Jorge chato" }]);
});

const screen = async () => {
  const n = await renderNative(
    <QueryClientProvider client={client}>
      <ClassRequestsSection />
    </QueryClientProvider>
  );
  await n.flush(); // the lists land
  return JSON.stringify(n.root.toJSON());
};

describe("the student's list on iOS (PAD-795 Not this spec)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads", async () => {
    const out = await screen();
    // Both kinds of row render from the two old endpoints, merged, with the coach named.
    expect(out).toContain("class-request-row-pending");
    expect(out).toContain("class-join-list-row-pending");
    expect(out).toContain("classRequests.with|Ana");
    expect(listCoachRequests).not.toHaveBeenCalled();
  });

  it("[PLAYERS-NICKNAME-8] the roster is never asked for and no nickname appears", async () => {
    const out = await screen();
    expect(out).not.toContain("Jorge chato");
    expect(getCoachPlayers).not.toHaveBeenCalled(); // the student never asks for the roster
  });
});
