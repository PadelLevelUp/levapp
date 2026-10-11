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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length ? `${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
  }),
}));

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

// ── PAD-574 (semi-auto-approval rules 4 and 7a) ──────────────────────────────────────────────
const q = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}` }));
const vac = (vacancyId: number, over: Record<string, unknown>) =>
  ({ vacancyId, declinedPlayerId: null, declinedPlayerName: null, queue: [], waitingListPlayerId: null, waitingListPlayerName: null, ...over });
const bundleOf = (vacancies: unknown[]) =>
  ({ bundleId: "b-574", lessonInstanceId: 1, windowOpenAt: null, responded: false, vacancies }) as unknown as ApprovalBundle;

describe("PAD-574 the card says why each spot is open, groups open spots, previews five", () => {
  it("a freed spot names the student; a never-filled spot reads as an open spot", () => {
    render(<ReplacementApprovalCard bundle={bundleOf([
      vac(1, { declinedPlayerId: 3, declinedPlayerName: "Ana", openSpot: false, side: "left", queue: q(2) }),
      vac(2, { openSpot: true, side: "right", queue: q(2) }),
    ])} />);
    expect(screen.getByTestId("approval-reason-declined").textContent).toBe("notificationsUi.replacementApproval.declinedReason:name=Ana");
    expect(screen.getByTestId("approval-reason-open").textContent).toBe("notificationsUi.replacementApproval.openSpotReason");
    expect(screen.getByTestId("approval-group-label").textContent).toBe(
      "notificationsUi.replacementApproval.openSpotGroup:count=1,side=notificationsUi.replacementApproval.sideRight",
    );
    expect(screen.getAllByTestId("approval-block")).toHaveLength(2);
  });

  it("groups identical open-spot lists by side with a count; freed spots stay apart", () => {
    const a = q(3);
    render(<ReplacementApprovalCard bundle={bundleOf([
      vac(1, { openSpot: true, side: "left", queue: a }),
      vac(2, { openSpot: true, side: "right", queue: q(2) }),
      vac(3, { openSpot: true, side: "left", queue: a }),
      vac(4, { declinedPlayerId: 9, declinedPlayerName: "Bob", openSpot: false, side: "left", queue: a }),
    ])} />);
    const groups = screen.getAllByTestId("approval-block");
    expect(groups.map((g) => g.getAttribute("data-kind"))).toEqual(["open", "open", "declined"]);
    expect(screen.getAllByTestId("approval-group-label")[0].textContent).toContain("openSpotGroup:count=2,side=notificationsUi.replacementApproval.sideLeft");
  });

  it("shows the first five with 'Ver mais' and the approving-invites-all line only while truncated", () => {
    render(<ReplacementApprovalCard bundle={bundleOf([vac(1, { openSpot: true, side: null, queue: q(31) })])} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("approval-showing-of").textContent).toBe("notificationsUi.replacementApproval.showingOf:shown=5,total=31");
    const more = screen.getByTestId("approval-show-more");
    expect(more.textContent).toBe("notificationsUi.replacementApproval.showMore:count=26");
    fireEvent.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(31);
    expect(screen.queryByTestId("approval-showing-of")).toBeNull();
    expect(screen.getByTestId("approval-show-more").textContent).toBe("notificationsUi.replacementApproval.showLess");
  });

  it("a list of five or fewer shows neither the button nor the line", () => {
    render(<ReplacementApprovalCard bundle={bundleOf([vac(1, { openSpot: true, side: "left", queue: q(5) })])} />);
    expect(screen.queryByTestId("approval-show-more")).toBeNull();
    expect(screen.queryByTestId("approval-showing-of")).toBeNull();
  });
});
