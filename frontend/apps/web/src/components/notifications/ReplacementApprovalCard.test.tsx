/**
 * PAD-545 (semi-auto-approval rules 8 and 12): the conversation's card offers the send buttons only;
 * "Ignorar" exists on the class's card. A bundle a recompute replaced says so instead of deciding.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const respondToApproval = vi.fn();
const toastInfo = vi.fn();
// PAD-660: these tests are about something else; the coach's resolver answers the real name.
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
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

// ── PAD-661 (semi-auto-approval rule 4b) ─────────────────────────────────────────────────────
describe("PAD-661 an empty queue says why", () => {
  it("lists one line per engine stage under the empty state, in the payload's order", () => {
    render(<ReplacementApprovalCard bundle={bundleOf([
      vac(1, { openSpot: true, side: "left", queue: [], emptyQueueReasons: [{ stage: "eligibility", count: 7 }, { stage: "excluded_by_coach", count: 2 }] }),
    ])} />);
    expect(screen.getByTestId("approval-empty-reason-eligibility").textContent).toBe(
      "notificationsUi.replacementApproval.emptyReason.eligibility:count=7",
    );
    expect(screen.getByTestId("approval-empty-reason-excluded_by_coach").textContent).toBe(
      "notificationsUi.replacementApproval.emptyReason.excluded_by_coach:count=2",
    );
    expect(screen.getByTestId("approval-empty-reasons").children).toHaveLength(2);
  });

  it("an older payload without reasons, or a non-empty queue, shows no reasons", () => {
    render(<ReplacementApprovalCard bundle={bundleOf([
      vac(1, { openSpot: true, side: "left", queue: [] }),
      vac(2, { openSpot: true, side: "right", queue: q(2), emptyQueueReasons: [{ stage: "eligibility", count: 7 }] }),
    ])} />);
    expect(screen.queryByTestId("approval-empty-reasons")).toBeNull();
  });
});

describe("ReplacementApprovalCard — PAD-765 (rule 11)", () => {
  const resolved = (r: "filled" | "expired") =>
    ({ ...BUNDLE, vacancies: BUNDLE.vacancies.map((v) => ({ ...v, resolved: r })) }) as ApprovalBundle;

  it("a message whose spot filled another way offers no buttons and says it is no longer needed", () => {
    render(<ReplacementApprovalCard bundle={resolved("filled")} />);
    expect(screen.queryByTestId("approve-invitations-now")).toBeNull();
    expect(screen.getByText("notificationsUi.replacementApproval.noLongerNeeded")).toBeTruthy();
  });

  it("a live edit of the message takes the buttons away", () => {
    const { rerender } = render(<ReplacementApprovalCard bundle={BUNDLE} />);
    expect(screen.getByTestId("approve-invitations-now")).toBeTruthy();
    rerender(<ReplacementApprovalCard bundle={resolved("expired")} />);
    expect(screen.queryByTestId("approve-invitations-now")).toBeNull();
  });
});

describe("PAD-770 (rule 12b): the message's queue says when it was built", () => {
  it("shows the time when the conversation passes one", () => {
    render(<ReplacementApprovalCard bundle={BUNDLE} queueAsOf="2026-10-27T20:41:00Z" />);
    expect(screen.getByTestId("approval-queue-as-of")).toBeTruthy();
  });

  it("the class's card, live, shows none", () => {
    render(<ReplacementApprovalCard bundle={BUNDLE} allowDismiss />);
    expect(screen.queryByTestId("approval-queue-as-of")).toBeNull();
  });

  it("the conversation passes the message's time; the class's cards pass none", () => {
    const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
    expect(read("../messages/MessageBubble.tsx")).toContain("queueAsOf={message.timestamp}");
    expect(read("../calendar/ClassDetailSheet.tsx")).not.toContain("queueAsOf");
  });
});
