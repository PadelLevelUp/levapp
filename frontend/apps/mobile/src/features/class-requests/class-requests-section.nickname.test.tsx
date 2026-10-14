/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the coach's class-requests list prints the
 * coach's display name for the student (private and academy rows); a student's list prints the
 * coach, never a roster name. react-query and the API are stand-ins (the mobile harness cannot
 * mount react-query against the app's React copy); `useCoachDisplayName` maps one player id.
 */
import { describe, expect, it, vi } from "vitest";
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

const enabledSeen = vi.hoisted(() => [] as Array<boolean | undefined>);
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: (o?: { enabled?: boolean }) => {
    enabledSeen.push(o?.enabled);
    return (id: string | number | null | undefined, real: string | null | undefined) =>
      o?.enabled !== false && String(id) === "jorge-id" ? "Jorge chato" : (real ?? "");
  },
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === "class-requests" ? [PRIVATE] : queryKey[0] === "class-join-requests" ? [ACADEMY] : [],
    isLoading: false,
    isError: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@levelup/api/src/resources/classRequests", () => ({ listClassRequests: vi.fn(), classRequestRefusal: () => null }));
vi.mock("@levelup/api/src/resources/classJoinRequests", () => ({ listClassJoinRequests: vi.fn() }));

import { ClassRequestsSection } from "./class-requests-section";

const screen = async (role: "coach" | "student") =>
  JSON.stringify((await renderNative(<ClassRequestsSection role={role} />)).root.toJSON());

describe("class requests print the coach's name for the student (PAD-660 rule 8)", () => {
  it("coach: private row and academy row show the nickname, never the real name", async () => {
    const out = await screen("coach");
    expect(out).toContain("classRequests.from|Jorge chato");
    expect(out).toContain('"Jorge chato"');
    expect(out).not.toContain("Jorge Silva");
    expect(enabledSeen.at(-1)).toBe(true);
  });

  it("student: the hook is off and no roster name appears", async () => {
    const out = await screen("student");
    expect(out).not.toContain("Jorge chato");
    expect(enabledSeen.at(-1)).toBe(false);
  });
});
