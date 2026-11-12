/**
 * PAD-920 (dashboard.blocks new-engine readings, DASHBOARD-BLOCKS-57): the student's home card for a
 * new-engine invitation on iOS. A `vacancy_invite` carrying `invitationId` answers on
 * `/notify/respond` with `{invitationId, action}` and shows the route's answer through the shared
 * `engineAnswerToast`; one carrying `notificationEventId` is the old engine's and answers as today.
 * `t` reads the real pt locale file, so the words checked are the ones the student reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineAnswerToast } from "@levelup/config";
import type { DashboardNeedsYouBlock, DashboardNeedsYouVacancyInvite, EngineRespondAction } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const PT = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../src/locales/pt/dashboard.json"), "utf8"),
) as Record<string, unknown>;

function ptT(key: string): string {
  const raw = key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
  return typeof raw === "string" ? raw : key;
}

const { api, toast } = vi.hoisted(() => ({
  api: { respondToEngineInvitation: vi.fn(), respondToNotification: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@levelup/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  notificationEngineApi: api,
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: ptT, i18n: { language: "pt" } }),
}));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSnoozeNeedsYouItem: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NeedsYouQueue } from "./blocks";

const card = (fields: Partial<DashboardNeedsYouVacancyInvite>): DashboardNeedsYouVacancyInvite => ({
  kind: "vacancy_invite",
  id: "x",
  lessonInstanceId: 16,
  classTitle: "Iniciação",
  date: "2026-11-15",
  timeLabel: "17:00",
  filled: 1,
  capacity: 4,
  href: "/calendar?classId=lessoninstance-16&date=2026-11-15",
  ...fields,
});

async function mount(item: DashboardNeedsYouVacancyInvite) {
  const block = { id: "needs_you", type: "needs_you", data: { count: 1, items: [item] } } as DashboardNeedsYouBlock;
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const n = await renderNative(createElement(QueryClientProvider, { client }, createElement(NeedsYouQueue, { block })));
  return n;
}

beforeEach(() => {
  api.respondToEngineInvitation.mockReset();
  api.respondToNotification.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("PAD-920 the student's home card for a new-engine invitation on iOS", () => {
  it("[DASHBOARD-BLOCKS-57] answers a new-engine invitation by its id and shows the answer", async () => {
    // The new engine's card: Yes goes by `invitationId`; the route answers sorry, bad news.
    api.respondToEngineInvitation.mockResolvedValue({ action: "sorry", invitationId: 42 });
    const engine = await mount(card({ id: "invitation-42", invitationId: 42 }));
    await engine.press("dashboard-confirm-yes");
    await engine.flush();
    expect(api.respondToEngineInvitation).toHaveBeenCalledWith({ invitationId: 42, action: "yes" });
    expect(api.respondToNotification).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ptT("dashboard.needsYou.engineAnswer.sorry"));
    expect(toast.success).not.toHaveBeenCalled();
    engine.root.unmount();

    // The old engine's card answers by `notificationEventId`, as today.
    api.respondToNotification.mockResolvedValue({ action: "confirmed" });
    const old = await mount(card({ id: "vacancy-7", notificationEventId: 7 }));
    await old.press("dashboard-confirm-yes");
    await old.flush();
    expect(api.respondToNotification).toHaveBeenCalledWith(7, "yes");
    expect(api.respondToEngineInvitation).toHaveBeenCalledTimes(1);
    old.root.unmount();

    // Each of the five actions shows its own toast from the shared helper, in its tone.
    const actions: EngineRespondAction[] = ["confirmed", "declined", "sorry", "closed_same_hour", "class_started"];
    for (const action of actions) {
      toast.success.mockReset();
      toast.error.mockReset();
      api.respondToEngineInvitation.mockResolvedValue({ action, invitationId: 42 });
      const n = await mount(card({ id: "invitation-42", invitationId: 42 }));
      await n.press(action === "declined" ? "dashboard-confirm-no" : "dashboard-confirm-yes");
      await n.flush();
      const expected = engineAnswerToast(action)!;
      const shown = expected.tone === "good" ? toast.success : toast.error;
      expect(shown).toHaveBeenCalledWith(ptT(expected.key));
      expect(ptT(expected.key)).not.toBe(expected.key);
      n.root.unmount();
    }

    // An action the helper does not know shows the generic failure, never a blank toast.
    toast.error.mockReset();
    api.respondToEngineInvitation.mockResolvedValue({ action: "something_new", invitationId: 42 });
    const unknown = await mount(card({ id: "invitation-42", invitationId: 42 }));
    await unknown.press("dashboard-confirm-yes");
    await unknown.flush();
    expect(toast.error).toHaveBeenCalledWith(ptT("dashboard.answer.failed"));
  });
});
