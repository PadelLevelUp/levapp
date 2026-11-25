/**
 * UI idea 1 (dashboard.blocks rule 14, DASHBOARD-BLOCKS-62): the student's three ask cards answer on one
 * full-width strip at the card's foot. Located by test id and class token; `t` returns the key, so the
 * words are the keys the cards already used (they do not change).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  DashboardNeedsYouBlock,
  DashboardNeedsYouInvite,
  DashboardNeedsYouItem,
  DashboardNeedsYouVacancyInvite,
  DashboardNeedsYouWaitingListOffer,
} from "@levelup/types";

const { t } = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t, i18n: { language: "pt" } }) }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<object>()), useNavigate: () => navigate }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api/src/resources/dashboard", () => ({ snoozeNeedsYouItem: vi.fn() }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const api = vi.hoisted(() => ({
  respondToReminder: vi.fn(),
  respondToNotification: vi.fn(),
  respondToWaitingList: vi.fn(),
  respondToEngineInvitation: vi.fn(),
}));
vi.mock("@/api/notificationEngine", () => api);

import { NeedsYouQueue } from "./NeedsYouQueue";

const base = { date: "2026-11-26", timeLabel: "19:00", filled: 3, capacity: 4, href: "/calendar?classId=lessoninstance-7" };
const invite: DashboardNeedsYouInvite = { kind: "invite", id: "invite-7", lessonInstanceId: 7, classTitle: "Iniciação", ...base };
const vacancy: DashboardNeedsYouVacancyInvite = {
  kind: "vacancy_invite",
  id: "vacancy:5",
  lessonInstanceId: 12,
  notificationEventId: 5,
  classTitle: "Avançado",
  ...base,
};
const waiting: DashboardNeedsYouWaitingListOffer = {
  kind: "waiting_list_offer",
  id: "waiting-9",
  lessonInstanceId: 9,
  classTitle: "Sub-18",
  date: base.date,
  timeLabel: base.timeLabel,
  href: base.href,
} as DashboardNeedsYouWaitingListOffer;

const block = (...items: DashboardNeedsYouItem[]): DashboardNeedsYouBlock => ({
  id: "needs_you",
  type: "needs_you",
  data: { count: items.length, items },
});

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

/** Each ask card: its test id, its title and "Abrir" keys, and the call a Yes must make. */
const CARDS = [
  { testId: "dashboard-queue-invite", item: invite, key: "invite", yes: () => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes") },
  { testId: "dashboard-queue-vacancy-invite", item: vacancy, key: "vacancyInvite", yes: () => expect(api.respondToNotification).toHaveBeenCalledWith(5, "yes") },
  { testId: "dashboard-queue-waiting-list-offer", item: waiting, key: "waitingListOffer", yes: () => expect(api.respondToWaitingList).toHaveBeenCalledWith(9, "yes") },
] as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the student's ask cards on web (UI idea 1)", () => {
  it("[DASHBOARD-BLOCKS-62] the three ask cards answer on one full-width strip", async () => {
    for (const c of CARDS) {
      render(<NeedsYouQueue block={block(c.item)} />);
      const card = screen.getByTestId(c.testId);

      // One strip, the direct parent of both buttons, on the blue-wash surface, outside the card's padding.
      const strips = within(card).getAllByTestId("dashboard-answer-strip");
      expect(strips, c.testId).toHaveLength(1);
      const strip = strips[0];
      const yes = within(card).getByTestId("dashboard-confirm-yes");
      const no = within(card).getByTestId("dashboard-confirm-no");
      expect(yes.parentElement, `${c.testId} yes`).toBe(strip);
      expect(no.parentElement, `${c.testId} no`).toBe(strip);
      expect(tokens(strip)).toContain("bg-secondary");
      for (let n: Element | null = strip.parentElement; n && n !== card; n = n.parentElement) {
        expect(tokens(n), `${c.testId}: the strip sits inside the card's padding`).not.toContain("p-4");
      }
      expect(tokens(card), `${c.testId}: the card clips the strip to its corners`).toContain("overflow-hidden");

      // 44px high and an equal share of the strip, for both.
      for (const b of [yes, no]) {
        expect(tokens(b), c.testId).toContain("h-11");
        expect(tokens(b), c.testId).toContain("flex-1");
        expect(tokens(b), c.testId).not.toContain("h-9");
      }

      // "Abrir" is out of the strip, at the right of the title, with a 44px touch area.
      const open = within(card).getByRole("button", { name: `dashboard.needsYou.${c.key}.open` });
      const title = within(card).getByText(`dashboard.needsYou.${c.key}.title`);
      expect(strip.contains(open)).toBe(false);
      expect(open.parentElement?.contains(title), `${c.testId}: Abrir shares the title's row`).toBe(true);
      expect(tokens(open.parentElement as Element)).toContain("justify-between");
      expect(tokens(open)).toContain("h-11");
      fireEvent.click(open);
      expect(navigate).toHaveBeenCalledWith(c.item.href);

      // Yes makes the same call as before, and both buttons are disabled while it is in flight.
      let finish: (v: unknown) => void = () => {};
      const inFlight = new Promise((resolve) => {
        finish = resolve;
      });
      api.respondToReminder.mockReturnValue(inFlight);
      api.respondToNotification.mockReturnValue(inFlight);
      api.respondToWaitingList.mockReturnValue(inFlight);
      await act(async () => {
        fireEvent.click(yes);
      });
      c.yes();
      expect((yes as HTMLButtonElement).disabled, `${c.testId} yes busy`).toBe(true);
      expect((no as HTMLButtonElement).disabled, `${c.testId} no busy`).toBe(true);
      await act(async () => {
        finish({ action: "confirmed" });
      });
      cleanup();
      vi.clearAllMocks();
    }
  });

  it("[DASHBOARD-BLOCKS-62] an invite with no lessonInstanceId has no strip and still shows Abrir", () => {
    const noInstance = { ...invite, lessonInstanceId: undefined } as unknown as DashboardNeedsYouInvite;
    render(<NeedsYouQueue block={block(noInstance)} />);
    const card = screen.getByTestId("dashboard-queue-invite");
    expect(within(card).queryByTestId("dashboard-answer-strip")).toBeNull();
    expect(within(card).queryByTestId("dashboard-confirm-yes")).toBeNull();
    expect(within(card).getByRole("button", { name: "dashboard.needsYou.invite.open" })).toBeInTheDocument();
  });
});
