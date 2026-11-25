/**
 * UI idea 1 on iOS (dashboard.blocks rule 14, DASHBOARD-BLOCKS-63 and -64): the student's three ask cards
 * answer on one full-width strip at the card's foot; the hero's Yes / No grow under their label with no strip;
 * the schedule row keeps its buttons. `t` returns the key (the words do not change); class tokens are read
 * off the mounted tree, as the KPI-tile layout test does.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type {
  DashboardNeedsYouBlock,
  DashboardNeedsYouInvite,
  DashboardNeedsYouItem,
  DashboardNeedsYouVacancyInvite,
  DashboardNeedsYouWaitingListOffer,
  DashboardNextClassBlock,
  DashboardSchedule7dBlock,
} from "@levelup/types";
import { renderNative } from "@/test/render-native";

const { api, toast } = vi.hoisted(() => ({
  api: {
    respondToReminder: vi.fn(),
    respondToNotification: vi.fn(),
    respondToWaitingList: vi.fn(),
    respondToEngineInvitation: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@levelup/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  notificationEngineApi: api,
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSnoozeNeedsYouItem: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NeedsYouQueue, NextClassHero, Schedule7Days } from "./blocks";

const tokens = (n: ReactTestInstance) => String(n.props.className ?? "").split(/\s+/);
const isHost = (n: ReactTestInstance) => typeof n.type === "string";
const hostParent = (n: ReactTestInstance): ReactTestInstance | null => {
  let p = n.parent;
  while (p && !isHost(p)) p = p.parent;
  return p;
};
const text = (n: ReactTestInstance): string => n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const hosts = (root: ReactTestInstance, id: string) => root.findAll((n) => n.props?.testID === id && isHost(n));
/** The host element that carries the press handler around a text. */
const pressableAround = (root: ReactTestInstance, key: string) => {
  const label = root.findAll((n) => isHost(n) && n.children.length === 1 && n.children[0] === key)[0];
  let p: ReactTestInstance | null = label ?? null;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  return p;
};

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
const waiting = {
  kind: "waiting_list_offer",
  id: "waiting-9",
  lessonInstanceId: 9,
  classTitle: "Sub-18",
  date: base.date,
  timeLabel: base.timeLabel,
  href: base.href,
} as DashboardNeedsYouWaitingListOffer;

const CARDS = [
  { testId: "dashboard-queue-invite", item: invite, key: "invite", yes: () => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes") },
  { testId: "dashboard-queue-vacancy-invite", item: vacancy, key: "vacancyInvite", yes: () => expect(api.respondToNotification).toHaveBeenCalledWith(5, "yes") },
  { testId: "dashboard-queue-waiting-list-offer", item: waiting, key: "waitingListOffer", yes: () => expect(api.respondToWaitingList).toHaveBeenCalledWith(9, "yes") },
] as const;

async function mount(element: ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderNative(createElement(QueryClientProvider, { client }, element));
}
const queue = (item: DashboardNeedsYouItem) =>
  createElement(NeedsYouQueue, {
    block: { id: "needs_you", type: "needs_you", data: { count: 1, items: [item] } } as DashboardNeedsYouBlock,
  });

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
});

describe("the student's ask cards on iOS (UI idea 1)", () => {
  it("[DASHBOARD-BLOCKS-63] the three ask cards answer on one full-width strip", async () => {
    for (const c of CARDS) {
      const n = await mount(queue(c.item));
      const card = n.byTestId(c.testId);

      const strips = hosts(n.root.root, "dashboard-answer-strip");
      expect(strips, c.testId).toHaveLength(1);
      const strip = strips[0];
      const yes = n.byTestId("dashboard-confirm-yes");
      const no = n.byTestId("dashboard-confirm-no");
      expect(hostParent(yes), `${c.testId} yes`).toBe(strip);
      expect(hostParent(no), `${c.testId} no`).toBe(strip);
      expect(tokens(strip)).toContain("bg-secondary");
      for (let p = hostParent(strip); p && p !== card; p = hostParent(p)) {
        expect(tokens(p), `${c.testId}: the strip sits inside the card's padding`).not.toContain("p-4");
      }
      expect(tokens(card.findAll((x) => isHost(x) && tokens(x).includes("rounded-2xl"))[0]), c.testId).toContain("overflow-hidden");

      for (const b of [yes, no]) {
        expect(tokens(b), c.testId).toContain("h-11");
        expect(tokens(b), c.testId).toContain("flex-1");
        expect(tokens(b), c.testId).not.toContain("h-9");
      }

      // "Abrir" is out of the strip, on the title's row, with a 44px touch area.
      const open = pressableAround(card, `dashboard.needsYou.${c.key}.open`);
      expect(open, `${c.testId} Abrir`).not.toBeNull();
      expect(strip.findAll((x) => x === open)).toHaveLength(0);
      const row = hostParent(open as ReactTestInstance) as ReactTestInstance;
      expect(text(row), c.testId).toContain(`dashboard.needsYou.${c.key}.title`);
      expect(tokens(row)).toContain("justify-between");
      expect(tokens(open as ReactTestInstance)).toContain("h-11");

      // Yes makes the same call as before, and both buttons are disabled while it is in flight.
      const inFlight = new Promise(() => {});
      api.respondToReminder.mockReturnValue(inFlight);
      api.respondToNotification.mockReturnValue(inFlight);
      api.respondToWaitingList.mockReturnValue(inFlight);
      await n.press("dashboard-confirm-yes");
      await n.flush();
      c.yes();
      expect(n.byTestId("dashboard-confirm-yes").props.disabled, `${c.testId} yes busy`).toBe(true);
      expect(n.byTestId("dashboard-confirm-no").props.disabled, `${c.testId} no busy`).toBe(true);
      for (const f of Object.values(api)) f.mockReset();
    }
  });

  it("[DASHBOARD-BLOCKS-63] an invite with no lessonInstanceId has no strip and still shows Abrir", async () => {
    const n = await mount(queue({ ...invite, lessonInstanceId: undefined } as unknown as DashboardNeedsYouInvite));
    expect(hosts(n.root.root, "dashboard-answer-strip")).toHaveLength(0);
    expect(n.queryByTestId("dashboard-confirm-yes")).toBeNull();
    expect(pressableAround(n.byTestId("dashboard-queue-invite"), "dashboard.needsYou.invite.open")).not.toBeNull();
  });
});

const asked = { lessonInstanceId: 3, pendingConfirmation: true, attendanceState: "planned" };
const hero = {
  id: "next_class",
  type: "next_class",
  data: {
    classId: "lessoninstance-3",
    title: "Treino A",
    date: "2026-11-26",
    startTime: "19:30",
    endTime: "21:00",
    isToday: true,
    inProgress: false,
    weekday: "Thursday",
    minutesUntil: 40,
    filled: 2,
    capacity: 4,
    players: [],
    href: "/calendar?classId=lessoninstance-3",
    ...asked,
  },
} as unknown as DashboardNextClassBlock;
const schedule = {
  id: "schedule_7d",
  type: "schedule_7d",
  data: {
    totalCount: 1,
    calendarHref: "/calendar",
    items: [
      {
        id: "lessoninstance-4",
        title: "Treino B",
        date: "2026-11-27",
        weekday: "Friday",
        dayOfMonth: 27,
        timeLabel: "19:30",
        filled: 2,
        capacity: 4,
        href: "/calendar?classId=lessoninstance-4",
        inProgress: false,
        ...asked,
        lessonInstanceId: 4,
      },
    ],
  },
} as unknown as DashboardSchedule7dBlock;

describe("the hero and the schedule row keep different answer sizes on iOS (UI idea 1)", () => {
  it("[DASHBOARD-BLOCKS-64] the hero grows and the schedule row keeps its buttons", async () => {
    const h = await mount(createElement(NextClassHero, { block: hero, student: true }));
    expect(hosts(h.root.root, "dashboard-answer-strip")).toHaveLength(0);
    const confirm = h.byTestId("dashboard-confirm");
    const wrapper = hostParent(confirm) as ReactTestInstance;
    expect(text(wrapper)).toContain("dashboard.schedule.toConfirm");
    expect(tokens(wrapper)).toContain("flex-col");
    expect(tokens(confirm)).toContain("w-full");
    for (const id of ["dashboard-confirm-yes", "dashboard-confirm-no"]) {
      expect(tokens(h.byTestId(id)), id).toContain("h-11");
      expect(tokens(h.byTestId(id)), id).toContain("flex-1");
      expect(tokens(h.byTestId(id)), id).not.toContain("h-9");
    }

    const s = await mount(createElement(Schedule7Days, { block: schedule, role: "student" }));
    expect(hosts(s.root.root, "dashboard-answer-strip")).toHaveLength(0);
    for (const id of ["dashboard-confirm-yes", "dashboard-confirm-no"]) {
      expect(tokens(s.byTestId(id)), id).toContain("h-9");
      expect(tokens(s.byTestId(id)), id).not.toContain("h-11");
      expect(tokens(s.byTestId(id)), id).not.toContain("flex-1");
    }
  });
});
