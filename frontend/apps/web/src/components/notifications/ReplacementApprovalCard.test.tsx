/**
 * PAD-545 (semi-auto-approval rules 8 and 12): the conversation's card offers the send buttons only;
 * "Ignorar" exists on the class's card. A bundle a recompute replaced says so instead of deciding.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const respondToApproval = vi.fn();
const toastInfo = vi.fn();
vi.mock("@/api/notificationEngine", () => ({ respondToApproval: (...a: unknown[]) => respondToApproval(...a) }));
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ReplacementApprovalCard } from "./ReplacementApprovalCard";
import type { ApprovalBundle } from "@/types";

const BUNDLE: ApprovalBundle = {
  bundleId: "b-old",
  lessonInstanceId: 1,
  windowOpenAt: null,
  responded: false,
  vacancies: [{ vacancyId: 7, declinedPlayerId: 3, declinedPlayerName: "Ana", queue: [],
                waitingListPlayerId: null, waitingListPlayerName: null }],
} as unknown as ApprovalBundle;

beforeEach(() => {
  respondToApproval.mockReset();
  toastInfo.mockReset();
});

describe("ReplacementApprovalCard (PAD-545)", () => {
  it("the conversation's card has no dismiss button", () => {
    render(<ReplacementApprovalCard bundle={BUNDLE} />);
    expect(screen.getByTestId("approve-invitations-now")).toBeTruthy();
    expect(screen.queryByTestId("dismiss-invitations")).toBeNull();
  });

  it("the class's card offers Ignorar", () => {
    render(<ReplacementApprovalCard bundle={BUNDLE} allowDismiss />);
    expect(screen.getByTestId("dismiss-invitations").textContent).toBe("notificationsUi.replacementApproval.ignore");
  });

  it("a yes on a recomputed bundle tells the coach the list was recalculated", async () => {
    respondToApproval.mockResolvedValue({ action: "yes_now", superseded: true,
                                          vacancies: [{ vacancyId: 7, result: "stale" }] });
    render(<ReplacementApprovalCard bundle={BUNDLE} />);
    fireEvent.click(screen.getByTestId("approve-invitations-now"));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("notificationsUi.replacementApproval.superseded"));
  });
});
