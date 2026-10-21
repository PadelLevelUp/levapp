/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the class's waiting list (coach only) prints
 * the coach's display name for the student, in the row and in the edit dialog's header. The
 * resolver is a stand-in mapping one player id (the harness cannot mount react-query hooks).
 */
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = ({ children }: { children?: unknown }) => children as never;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? (children as never) : null),
    DialogContent: ({ children }: { children?: unknown }) => children as never,
    DialogHeader: pass,
    DialogTitle: pass,
    DialogFooter: pass,
    DialogView: View,
  };
});
vi.mock("@/features/players/hooks", () => ({ useCoachPlayers: () => ({ data: [] }) }));
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: string | number | null | undefined, real: string | null | undefined) =>
    String(id) === "5" ? "Jorge chato" : (real ?? ""),
}));

import { ClassWaitingListSection } from "./class-waiting-list-section";

const row = {
  id: 1,
  playerId: 5,
  playerName: "Jorge Silva",
  joinedAt: null,
  origin: "manual",
  standingEntryId: null,
  seriesScoped: false,
  scope: "occurrence",
  expiresOn: null,
} as never;

const mount = () =>
  renderNative(
    <ClassWaitingListSection
      event={{ model: "ClassInstance", originalId: 1, date: "2026-10-20" }}
      isRecurring={false}
      rows={[row]}
      enrolledIds={[]}
      onChanged={() => undefined}
    />
  );

describe("the class waiting list prints the coach's name (PAD-660 rule 8)", () => {
  it("the row shows the nickname, not the real name", async () => {
    const out = JSON.stringify((await mount()).root.toJSON());
    expect(out).toContain("Jorge chato");
    expect(out).not.toContain("Jorge Silva");
  });

  it("the edit dialog's header shows the nickname", async () => {
    const n = await mount();
    await n.press("class-waiting-list-edit-5");
    expect(JSON.stringify(n.byTestId("class-waiting-list-editing-name").props.children)).toBe('"Jorge chato"');
  });
});
