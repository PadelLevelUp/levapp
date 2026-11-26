/**
 * attendance.confirm rule 30, criterion ATTENDANCE-CONFIRM-42 (PAD-772) on iOS: the coach's row names a
 * decline made from an availability block as a detail line under the one state word, never a second state;
 * the student's own row says nothing. `t` returns the key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { Player } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [],
}));

import { ParticipantRow } from "./ParticipantRow";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

const player = { id: 7, user: { name: "Jorge Silva" } } as unknown as Player;
const BLOCK = {
  attendanceState: "not_coming", status: "absent", validated: false, confirmed: true,
  declineSource: "availability_block", respondedAt: "2026-09-21T10:00:00+00:00",
};

async function mount(presence: Record<string, unknown>, audience: "coach" | "student" = "coach") {
  const n = await renderNative(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ParticipantRow, { player, presence: presence as never, attendance: { status: "absent" }, canMark: false, audience, classEnded: false })
    )
  );
  await n.flush();
  return n;
}

describe("an unavailability decline on the coach's row (PAD-772)", () => {
  it("[ATTENDANCE-CONFIRM-42] an unavailability decline is a detail line on the coach's row only", async () => {
    const n = await mount({ ...BLOCK, cancelledByStudent: true, cancelledAt: "2026-09-20T09:30:00+00:00" });
    const json = JSON.stringify(n.root.toJSON());
    expect(n.queryByTestId("attendance-cancelled-by-student")).not.toBeNull();
    expect(json).toContain("calendar.detail.cancelledUnavailableAt");
    expect(json).not.toContain("calendar.detail.cancelledByStudentAt");
    // One state word beside the detail line, not two.
    expect(json.match(/calendar\.attendanceState\.[a-z_]+\.coach/g) ?? []).toHaveLength(1);
  });

  it("[ATTENDANCE-CONFIRM-42] the same decline on a new-engine session (cancelledByStudent false) reads the same; the student's row says nothing", async () => {
    const coach = await mount({ ...BLOCK, cancelledByStudent: false, cancelledAt: null });
    expect(JSON.stringify(coach.root.toJSON())).toContain("calendar.detail.cancelledUnavailableAt");
    const student = await mount(BLOCK, "student");
    expect(student.queryByTestId("attendance-cancelled-by-student")).toBeNull();
  });
});
