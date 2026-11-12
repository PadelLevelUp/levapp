/**
 * PAD-920 (dashboard.blocks NA2, DASHBOARD-BLOCKS-50): the coach alert card on iOS. The same item the
 * web gets shows the shared copy (`engineAlertCopy`) under the shared test id, and pressing the card
 * opens the native class screen the way the empty-seats card does. `t` here reads the real pt locale
 * file, so the words checked are the ones the coach reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { DashboardNeedsYouBlock, DashboardNeedsYouEngineAlert } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const PT = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../src/locales/pt/dashboard.json"), "utf8"),
) as Record<string, unknown>;

function ptT(key: string, params?: Record<string, unknown>): string {
  const raw = key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
  if (typeof raw !== "string") return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));
}

const { push, snooze } = vi.hoisted(() => ({ push: vi.fn(), snooze: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: ptT, i18n: { language: "pt" } }),
}));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSnoozeNeedsYouItem: () => ({ mutate: snooze, isPending: false }),
}));
// `./blocks` pulls in `@/components/ui/toast`, which reaches `@expo/vector-icons` at import time.
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NeedsYouQueue } from "./blocks";

const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const alert: DashboardNeedsYouEngineAlert = {
  kind: "engine_alert",
  id: "engine_alert:12:right",
  lessonInstanceId: 12,
  classTitle: "Iniciação",
  date: "2026-11-19",
  startTime: "19:00",
  reason: "no_candidate",
  side: "right",
  levelId: null,
  levelLabel: null,
  count: 1,
  href: "/calendar?classId=lessoninstance-12&date=2026-11-19",
};

const block = {
  id: "needs_you",
  type: "needs_you",
  data: { count: 1, items: [alert] },
} as DashboardNeedsYouBlock;

describe("PAD-920 the coach alert card on iOS (dashboard.blocks NA2)", () => {
  beforeEach(() => {
    push.mockClear();
    snooze.mockClear();
  });

  it("[DASHBOARD-BLOCKS-50] shows the coach alert card and opens the class", async () => {
    const n = await renderNative(createElement(NeedsYouQueue, { block }));
    const card = text(n.byTestId("needs-you-engine-alert-12-right"));
    expect(card).toContain(ptT("dashboard.needsYou.engineAlert.title"));
    expect(card).toContain("1 vaga(s) (lado direito) · Iniciação, Qui 19:00");
    expect(card).toContain(ptT("dashboard.needsYou.engineAlert.hint"));

    await n.press("needs-you-engine-alert-12-right");
    expect(push).toHaveBeenCalledWith({
      pathname: "/class/[id]",
      params: expect.objectContaining({
        id: "lessoninstance-12",
        model: "LessonInstance",
        originalId: "12",
        date: "2026-11-19",
        startTime: "19:00",
        title: "Iniciação",
      }),
    });

    // "Later" snoozes it like the other needs-you items (rule 3c).
    await n.press("needs-you-later");
    expect(snooze).toHaveBeenCalledWith("engine_alert:12:right", expect.anything());
  });
});
