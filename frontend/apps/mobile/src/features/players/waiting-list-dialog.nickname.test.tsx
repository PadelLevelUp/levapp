/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the standing waiting-list dialog (opened by a
 * coach from a student's profile) names the student as the coach does in its description. The
 * resolver is the real `useCoachDisplayName` since PAD-406 (a stand-in before), reading a one-student roster; the mutations are inert.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [{ playerId: "5", name: "Jorge Silva", displayName: "Jorge chato" }],
}));

import { WaitingListDialog } from "./waiting-list-dialog";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

describe("the standing waiting-list dialog names the student as the coach does (PAD-660 rule 8)", () => {
  it("the description carries the nickname, not the real name", async () => {
    const n = await renderNative(
      <QueryClientProvider client={client}>
        <WaitingListDialog open onClose={() => undefined} playerId={5} playerName="Jorge Silva" />
      </QueryClientProvider>
    );
    await n.flush(); // the roster lands
    const out = JSON.stringify(n.root.toJSON());
    expect(out).toContain("players.waitingListDescription|Jorge chato");
    expect(out).not.toContain("Jorge Silva");
  });
});
