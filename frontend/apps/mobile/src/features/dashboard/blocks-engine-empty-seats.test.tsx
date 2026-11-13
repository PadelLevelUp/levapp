/**
 * PAD-932 (dashboard.blocks NA5, DASHBOARD-BLOCKS-60): the coach's empty-seats card on iOS for a
 * new-engine class says how many invitations the engine has pending and keeps Convidar and "Mais
 * tarde". An old-engine item, or one without `engineVersion`, is today's card. `t` reads the real pt
 * locale file, so the words checked are the ones the coach reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { DashboardNeedsYouBlock, DashboardNeedsYouEmptySeats } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const PT = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../src/locales/pt/dashboard.json"), "utf8"),
) as Record<string, unknown>;

/** i18next's pt plural: `_one` for 1, `_other` otherwise; the bare key when there is no count. */
function ptT(key: string, params?: Record<string, unknown>): string {
  const lookup = (k: string) =>
    k.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
  const count = params?.count;
  const raw = (typeof count === "number" ? lookup(`${key}_${count === 1 ? "one" : "other"}`) : undefined) ?? lookup(key);
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
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NeedsYouQueue } from "./blocks";

const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const seats = (fields: Partial<DashboardNeedsYouEmptySeats>): DashboardNeedsYouEmptySeats => ({
  kind: "empty_seats",
  id: "lessoninstance-783",
  classTitle: "Ensaio motor novo",
  seatsMissing: 3,
  date: "2026-11-13",
  timeLabel: "17:00",
  filled: 1,
  capacity: 4,
  href: "/calendar?classId=lessoninstance-783&date=2026-11-13&notify=1",
  ...fields,
});

const mount = (item: DashboardNeedsYouEmptySeats) =>
  renderNative(
    createElement(NeedsYouQueue, {
      block: { id: "needs_you", type: "needs_you", data: { count: 1, items: [item] } } as DashboardNeedsYouBlock,
    })
  );

describe("PAD-932 the iOS empty-seats card on a new-engine class (dashboard.blocks NA5)", () => {
  it("[DASHBOARD-BLOCKS-60] shows the pending count and keeps the invite button on a new-engine class", async () => {
    const id = "lessoninstance-783";

    // New engine, 5 pending: the pending line in the coach's words, Convidar opens the class with
    // Notificar, "Mais tarde" stays.
    push.mockClear();
    const engine = await mount(seats({ engineVersion: "new", pendingInvites: 5 }));
    await engine.press(`needs-you-invite-${id}`);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/class/[id]" }));
    const pendingWords = ptT("dashboard.needsYou.emptySeats.pending", { count: 5 });
    expect(pendingWords).not.toBe("dashboard.needsYou.emptySeats.pending");
    expect(text(engine.byTestId(`needs-you-pending-${id}`))).toBe(pendingWords);
    expect(pendingWords).toContain("5");
    await engine.press("needs-you-later");
    expect(snooze).toHaveBeenCalledWith(id, expect.anything());
    engine.root.unmount();

    // One pending reads singular.
    const one = await mount(seats({ engineVersion: "new", pendingInvites: 1 }));
    expect(text(one.byTestId(`needs-you-pending-${id}`))).toBe(ptT("dashboard.needsYou.emptySeats.pending", { count: 1 }));
    one.root.unmount();

    // None pending: no line, Convidar still there.
    const none = await mount(seats({ engineVersion: "new", pendingInvites: 0 }));
    expect(none.queryByTestId(`needs-you-pending-${id}`)).toBeNull();
    expect(none.byTestId(`needs-you-invite-${id}`)).toBeTruthy();
    none.root.unmount();

    // Old engine, and an item without engineVersion (an older server): today's card, Convidar opens
    // the class with Notificar, and no pending line.
    for (const fields of [{ engineVersion: "old" as const }, {}]) {
      push.mockClear();
      const old = await mount(seats(fields));
      expect(old.queryByTestId(`needs-you-pending-${id}`)).toBeNull();
      await old.press(`needs-you-invite-${id}`);
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/class/[id]" }));
      old.root.unmount();
    }
  });
});
