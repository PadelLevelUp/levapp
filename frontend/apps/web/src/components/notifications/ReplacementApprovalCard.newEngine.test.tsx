/**
 * PAD-920 (semi-auto-approval N5): a new-engine request is one block per spot type; the coach
 * removes students and answers "Sim" for the rest, or "Ignorar" on the class's card. A request a
 * newer one replaced says so and offers nothing. There is no "at the window" for the new engine.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const respondToEngineApproval = vi.fn();
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
vi.mock("@/api/notificationEngine", () => ({
  respondToApproval: vi.fn(),
  respondToEngineApproval: (...a: unknown[]) => respondToEngineApproval(...a),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length ? `${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
  }),
}));

import { ReplacementApprovalCard } from "./ReplacementApprovalCard";
import type { EngineApprovalMeta, EngineApprovalState } from "@levelup/types";

const queue = Array.from({ length: 7 }, (_, i) => ({ playerId: `s${i + 1}`, name: `S${i + 1}`, nickname: null, tier: i < 2 ? 0 : 2, rank: i + 1 }));
const spotTypes = [
  { side: "left" as const, levelId: null, levelLabel: null, queue },
  { side: null, levelId: 3, levelLabel: "M3", queue: [],
    emptyQueueReasons: [{ stage: "said_no", count: 2 }, { stage: "in_session", count: 3 }, { stage: "invited", count: 0 }] },
];
const classState: EngineApprovalState = {
  engine: "new", state: "pending", semiAutomatic: true, approved: [], removed: [],
  request: { requestId: 42, lessonInstanceId: 9, spotTypes },
};
const message: EngineApprovalMeta = { engine: "new", requestId: 41, lessonInstanceId: 9, responded: false, spotTypes };

describe("ReplacementApprovalCard — new engine (PAD-920)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-41] approves with removals, dismisses and reads a stale answer", async () => {
    // The class's card: blocks, preview, removals, "Sim (2 retirados)".
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 42, result: "approved" });
    render(<ReplacementApprovalCard bundle={classState} allowDismiss />);
    const left = screen.getByTestId("approval-type-left");
    expect(within(left).getAllByRole("listitem")).toHaveLength(5);
    expect(within(left).getByTestId("approval-show-more").textContent).toBe("notificationsUi.replacementApproval.showMore:count=2");
    expect(within(left).getByTestId("approval-showing-of").textContent).toBe("notificationsUi.replacementApproval.showingOf:shown=5,total=7");
    const either = screen.getByTestId("approval-type-either");
    expect(within(either).getByTestId("approval-type-header").textContent).toContain("M3");
    expect(within(either).getByTestId("approval-type-header").textContent).toContain("tutorials.engine.sideEither");
    expect(within(either).getAllByTestId(/^approval-empty-reason-/).map((r) => r.textContent)).toEqual([
      "notificationsUi.replacementApproval.engine.reasonCount:reason=tutorials.engine.stage.said_no,count=2",
      "notificationsUi.replacementApproval.engine.reasonCount:reason=tutorials.engine.stage.in_session,count=3",
    ]);
    expect(screen.queryByText(/yesAt/)).toBeNull();
    expect(screen.queryByTestId("approve-invitations-now")).toBeNull();

    fireEvent.click(screen.getByTestId("approval-remove-s1"));
    fireEvent.click(screen.getByTestId("approval-remove-s2"));
    fireEvent.click(screen.getByTestId("approval-remove-s3"));
    fireEvent.click(screen.getByTestId("approval-remove-s3")); // put back
    expect(screen.getByTestId("approval-name-s1").className).toContain("line-through");
    expect(screen.getByTestId("approval-name-s3").className).not.toContain("line-through");
    const yes = screen.getByTestId("approval-yes");
    expect(yes.textContent).toBe("notificationsUi.replacementApproval.engine.yesRemoved:count=2");
    fireEvent.click(yes);
    await waitFor(() => expect(screen.queryByTestId("approval-yes")).toBeNull());
    expect(respondToEngineApproval).toHaveBeenLastCalledWith({ bundleId: 42, action: "yes_now", removed: ["s1", "s2"] });
    expect(screen.getByTestId("approval-outcome").textContent).toBe("notificationsUi.replacementApproval.approved");
    cleanup();

    // Another class card: "Ignorar".
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 42, result: "dismissed" });
    render(<ReplacementApprovalCard bundle={classState} allowDismiss />);
    fireEvent.click(screen.getByTestId("approval-dismiss"));
    await waitFor(() => expect(screen.getByTestId("approval-outcome").textContent).toBe("notificationsUi.replacementApproval.engine.dismissed"));
    expect(respondToEngineApproval).toHaveBeenLastCalledWith({ bundleId: 42, action: "dismiss" });
    cleanup();

    // The conversation's card: "Sim" only; the answer comes back stale.
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 41, result: "stale" });
    render(<ReplacementApprovalCard bundle={message} />);
    expect(screen.queryByTestId("approval-dismiss")).toBeNull();
    expect(screen.getByTestId("approval-yes").textContent).toBe("notificationsUi.replacementApproval.engine.yes");
    fireEvent.click(screen.getByTestId("approval-yes"));
    await waitFor(() => expect(screen.getByTestId("approval-replaced").textContent).toBe("notificationsUi.replacementApproval.engine.replaced"));
    expect(respondToEngineApproval).toHaveBeenLastCalledWith({ bundleId: 41, action: "yes_now", removed: [] });
    expect(screen.queryByTestId("approval-yes")).toBeNull();
    expect(screen.queryByTestId("approval-dismiss")).toBeNull();
  });

  it("reads the message's own state: replaced, approved, and an older payload's responded", () => {
    render(<ReplacementApprovalCard bundle={{ ...message, state: "replaced" }} />);
    expect(screen.getByTestId("approval-replaced")).toBeTruthy();
    expect(screen.queryByTestId("approval-yes")).toBeNull();
    cleanup();
    render(<ReplacementApprovalCard bundle={{ ...message, state: "approved" }} />);
    expect(screen.getByTestId("approval-outcome")).toBeTruthy();
    expect(screen.queryByTestId("approval-yes")).toBeNull();
    cleanup();
    render(<ReplacementApprovalCard bundle={{ ...message, responded: true }} />);
    expect(screen.getByTestId("approval-replaced")).toBeTruthy();
  });
});
