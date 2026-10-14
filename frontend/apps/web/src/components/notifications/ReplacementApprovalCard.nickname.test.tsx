/** players.nickname rule 8 (PAD-660): the approval card names students the way the coach does. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "3" || String(id) === "11" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("@/api/notificationEngine", () => ({ respondToApproval: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

import { ReplacementApprovalCard } from "./ReplacementApprovalCard";
import type { ApprovalBundle } from "@/types";

const BUNDLE = {
  bundleId: "b", lessonInstanceId: 1, windowOpenAt: null, responded: false,
  vacancies: [{ vacancyId: 7, declinedPlayerId: 3, declinedPlayerName: "Jorge Silva", openSpot: false, side: null,
    queue: [{ id: "11", name: "Jorge Silva" }, { id: "12", name: "Ana Pinto" }] }],
} as unknown as ApprovalBundle;

describe("ReplacementApprovalCard names", () => {
  it("print the nickname for the freed spot and the queue, the real name for another student", () => {
    render(<ReplacementApprovalCard bundle={BUNDLE} />);
    expect(screen.getByTestId("approval-reason-declined").textContent).toContain("Jorge chato");
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Jorge chato");
    expect(items[1]).toContain("Ana Pinto");
  });
});
