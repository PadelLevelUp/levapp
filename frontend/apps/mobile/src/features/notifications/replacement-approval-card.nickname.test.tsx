/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the semi-automatic approval card is a coach
 * view; the freed spot's student and every queued student show under the coach's own display
 * name. The resolver is a stand-in mapping one player id (the harness cannot mount react-query).
 */
import { describe, expect, it, vi } from "vitest";
import type { ApprovalBundle } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { name?: string }) => (o?.name ? `${key}|${o.name}` : key) }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: { respondToApproval: vi.fn() } }));
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: string | number | null | undefined, real: string | null | undefined) =>
    String(id) === "5" ? "Jorge chato" : (real ?? ""),
}));

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
    const n = await renderNative(<ReplacementApprovalCard bundle={bundle} />);
    const out = JSON.stringify(n.root.toJSON());
    expect(out).toContain("declinedReason|Jorge chato");
    expect(out).toContain('"Jorge chato"');
    expect(out).toContain("Rita Faria");
    expect(out).not.toContain("Jorge Silva");
  });
});
