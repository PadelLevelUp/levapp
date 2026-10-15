/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the standing waiting-list dialog (opened by a
 * coach from a student's profile) names the student as the coach does in its description. The
 * resolver is a stand-in mapping one player id; the mutations are inert.
 */
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { name?: string }) => (o?.name ? `${key}|${o.name}` : key) }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
vi.mock("@/components/ui/dialog", () => {
  const pass = ({ children }: { children?: unknown }) => children as never;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? (children as never) : null),
    DialogContent: pass,
    DialogHeader: pass,
    DialogTitle: pass,
    DialogFooter: pass,
  };
});
vi.mock("./hooks", () => ({
  useAddToStandingWaitingList: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRenewStandingWaitingList: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: string | number | null | undefined, real: string | null | undefined) =>
    String(id) === "5" ? "Jorge chato" : (real ?? ""),
}));

import { WaitingListDialog } from "./waiting-list-dialog";

describe("the standing waiting-list dialog names the student as the coach does (PAD-660 rule 8)", () => {
  it("the description carries the nickname, not the real name", async () => {
    const n = await renderNative(<WaitingListDialog open onClose={() => undefined} playerId={5} playerName="Jorge Silva" />);
    const out = JSON.stringify(n.root.toJSON());
    expect(out).toContain("players.waitingListDescription|Jorge chato");
    expect(out).not.toContain("Jorge Silva");
  });
});
