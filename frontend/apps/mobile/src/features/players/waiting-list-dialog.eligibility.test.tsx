/**
 * PAD-724 (PAD-669 R5; notifications.waiting-list rule 2a) on iOS: before adding a student to the
 * standing list, the classes it would reach whose bar they fail are named and the button turns into
 * "Adicionar mesmo assim"; a second press adds. With nothing to name, the first press adds (control).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
const add = vi.hoisted(() => vi.fn(() => Promise.resolve({ id: 1 })));
vi.mock("./hooks", () => ({
  useAddToStandingWaitingList: () => ({ isPending: false, mutateAsync: add }),
  useRenewStandingWaitingList: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
const api = vi.hoisted(() => ({ checkStandingEligibility: vi.fn() }));
vi.mock("@levelup/api/src/resources/notificationEngine", () => api);

import { WaitingListDialog } from "./waiting-list-dialog";

const failing = [{ lessonInstanceId: 9, title: "Sábado 18h", startDatetime: "2026-10-24T18:00:00", ineligible: [] }];

beforeEach(() => add.mockClear());

describe("PAD-724 the standing list warns before adding a student who fails some classes' bar", () => {
  it("names the classes on the first press, adds on the second", async () => {
    api.checkStandingEligibility.mockResolvedValue({ classes: failing });
    const n = await renderNative(<WaitingListDialog open onClose={() => undefined} playerId={2} playerName="Ana Pinto" />);
    await n.press("waiting-list-save");
    await n.flush();
    expect(n.queryByTestId("standing-wl-eligibility-warning")).not.toBeNull();
    expect(JSON.stringify(n.root.toJSON())).toContain("Sábado 18h");
    expect(add).not.toHaveBeenCalled();
    await n.press("waiting-list-save");
    await n.flush();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("with nothing to name, the first press adds", async () => {
    api.checkStandingEligibility.mockResolvedValue({ classes: [] });
    const n = await renderNative(<WaitingListDialog open onClose={() => undefined} playerId={2} playerName="Ana Pinto" />);
    await n.press("waiting-list-save");
    await n.flush();
    expect(add).toHaveBeenCalledTimes(1);
    expect(n.queryByTestId("standing-wl-eligibility-warning")).toBeNull();
  });
});
