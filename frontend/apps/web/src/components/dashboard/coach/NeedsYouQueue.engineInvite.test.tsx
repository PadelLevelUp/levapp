/**
 * PAD-920 (dashboard.blocks new-engine readings): the student's home card for an open invitation.
 * A new-engine card answers by `invitationId` and reads the answer through the shared toast helper;
 * an old-engine card answers by its event as before. Asserted by test id and i18n key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DashboardNeedsYouBlock, DashboardNeedsYouVacancyInvite } from "@levelup/types";
import { engineAnswerToast } from "@levelup/config";

const { t } = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t, i18n: { language: "pt" } }) }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<object>()), useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api/src/resources/dashboard", () => ({ snoozeNeedsYouItem: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const api = vi.hoisted(() => ({
  respondToEngineInvitation: vi.fn(),
  respondToNotification: vi.fn(),
  respondToWaitingList: vi.fn(),
}));
vi.mock("@/api/notificationEngine", () => api);

import { NeedsYouQueue } from "./NeedsYouQueue";

const card = (over: Partial<DashboardNeedsYouVacancyInvite>): DashboardNeedsYouVacancyInvite => ({
  kind: "vacancy_invite",
  id: "x",
  lessonInstanceId: 12,
  classTitle: "Iniciação",
  date: "2026-11-19",
  timeLabel: "19:00",
  filled: 3,
  capacity: 4,
  href: "/calendar?classId=lessoninstance-12&date=2026-11-19",
  ...over,
});

const block = (item: DashboardNeedsYouVacancyInvite): DashboardNeedsYouBlock => ({
  id: "needs_you",
  type: "needs_you",
  data: { count: 1, items: [item] },
});

async function pressYes() {
  const yes = within(screen.getByTestId("dashboard-queue-vacancy-invite")).getByTestId("dashboard-confirm-yes");
  await act(async () => {
    fireEvent.click(yes);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PAD-920 the web home card for a new-engine invitation", () => {
  it("[DASHBOARD-BLOCKS-56] answers a new-engine invitation by its id and shows the answer", async () => {
    // A new-engine card: its Yes goes to /notify/respond by invitationId; sorry is bad news.
    api.respondToEngineInvitation.mockResolvedValue({ action: "sorry", invitationId: 77 });
    render(<NeedsYouQueue block={block(card({ id: "invitation-77", invitationId: 77 }))} />);
    await pressYes();
    expect(api.respondToEngineInvitation).toHaveBeenCalledWith({ invitationId: 77, action: "yes" });
    expect(api.respondToNotification).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("dashboard.needsYou.engineAnswer.sorry");
    expect(toast.success).not.toHaveBeenCalled();
    cleanup();

    // An old-engine card answers by its event, as today.
    api.respondToNotification.mockResolvedValue({ action: "confirmed" });
    render(<NeedsYouQueue block={block(card({ id: "vacancy:5", notificationEventId: 5 }))} />);
    await pressYes();
    expect(api.respondToNotification).toHaveBeenCalledWith(5, "yes");
    expect(api.respondToEngineInvitation).toHaveBeenCalledTimes(1);

    // Each of the five answers has its toast in the shared helper.
    expect(engineAnswerToast("confirmed")).toEqual({ key: "dashboard.needsYou.engineAnswer.confirmed", tone: "good" });
    expect(engineAnswerToast("declined")).toEqual({ key: "dashboard.needsYou.engineAnswer.declined", tone: "good" });
    expect(engineAnswerToast("sorry")).toEqual({ key: "dashboard.needsYou.engineAnswer.sorry", tone: "bad" });
    expect(engineAnswerToast("closed_same_hour")).toEqual({
      key: "dashboard.needsYou.engineAnswer.closedSameHour",
      tone: "bad",
    });
    expect(engineAnswerToast("class_started")).toEqual({
      key: "dashboard.needsYou.engineAnswer.classStarted",
      tone: "bad",
    });
    expect(engineAnswerToast("reoffered")).toBeNull();
  });
});
