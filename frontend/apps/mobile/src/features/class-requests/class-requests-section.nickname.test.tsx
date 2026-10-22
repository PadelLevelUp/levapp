/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the coach's class-requests list prints the
 * coach's display name for the student (private and academy rows); a student's list prints the
 * coach, never a roster name. The hooks are the real @levelup/hooks since PAD-406 (stand-ins
 * before), in a real QueryClientProvider, over api spies: the roster names one player id.
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

const screen = async (role: "coach" | "student") => {
  const n = await renderNative(
    <QueryClientProvider client={client}>
      <ClassRequestsSection role={role} />
    </QueryClientProvider>
  );
  await n.flush(); // the lists and the roster land
  return JSON.stringify(n.root.toJSON());
};

describe("class requests print the coach's name for the student (PAD-660 rule 8)", () => {
  it("coach: private row and academy row show the nickname, never the real name", async () => {
    const out = await screen("coach");
    expect(out).toContain("classRequests.from|Jorge chato");
    expect(out).toContain('"Jorge chato"');
    expect(out).not.toContain("Jorge Silva");
    expect(getCoachPlayers).toHaveBeenCalled(); // the coach's roster is asked for
  });

  it("student: the hook is off and no roster name appears", async () => {
    const out = await screen("student");
    expect(out).not.toContain("Jorge chato");
    expect(getCoachPlayers).not.toHaveBeenCalled(); // the student never asks for the roster
  });
});
