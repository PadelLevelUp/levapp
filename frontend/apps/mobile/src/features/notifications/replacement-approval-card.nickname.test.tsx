/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the semi-automatic approval card is a coach
 * view; the freed spot's student and every queued student show under the coach's own display
 * name. The resolver is the real `useCoachDisplayName` since PAD-406 (a stand-in before), reading a one-student roster.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalBundle } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { name?: string }) => (o?.name ? `${key}|${o.name}` : key) }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: { respondToApproval: vi.fn() } }));
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [{ playerId: "5", name: "Jorge Silva", displayName: "Jorge chato" }],
}));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

import { ReplacementApprovalCard } from "./replacement-approval-card";

const bundle = {
  bundleId: "b1",
  lessonInstanceId: 1,
  windowOpenAt: null,
  responded: false,
  vacancies: [
    {
      vacancyId: 1,
      declinedPlayerId: 5,
      declinedPlayerName: "Jorge Silva",
      openSpot: false,
      queue: [
        { id: "5", name: "Jorge Silva" },
        { id: "6", name: "Rita Faria" },
      ],
    },
  ],
} as ApprovalBundle;

describe("the approval card prints the coach's name for students (PAD-660 rule 8)", () => {
  it("the freed spot and the queue show the nickname, others keep their name", async () => {
    const n = await renderNative(
      <QueryClientProvider client={client}>
        <ReplacementApprovalCard bundle={bundle} />
      </QueryClientProvider>
    );
    await n.flush(); // the roster lands
    const out = JSON.stringify(n.root.toJSON());
    expect(out).toContain("declinedReason|Jorge chato");
    expect(out).toContain('"Jorge chato"');
    expect(out).toContain("Rita Faria");
    expect(out).not.toContain("Jorge Silva");
  });
});
