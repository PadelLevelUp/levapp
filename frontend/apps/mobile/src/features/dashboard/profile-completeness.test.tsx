/**
 * PAD-490 (dashboard.profile-completeness rules 4, 6, 7; #523 review). Mounts the student card:
 * the remind button sends once and then reads "sent today" DISABLED (flow 152 only checks the
 * test id); a blocked pair gets the explanation and no button; the body names what is missing.
 * `@levelup/api` and react-query's client are mocked (the harness cannot mount react-query).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { DashboardProfileIncompleteBlock } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({ sendProfileReminder: vi.fn() }));
vi.mock("@levelup/api", () => ({ dashboardApi: api }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ProfileIncompleteBlock } from "./profile-completeness";

function block(entry: Partial<DashboardProfileIncompleteBlock["data"]["coaches"][number]> = {}): DashboardProfileIncompleteBlock {
  return {
    id: "profile_incomplete",
    type: "profile_incomplete",
    data: {
      coaches: [{ coachId: 7, coachName: "Ana", missing: ["level", "side"], remindedToday: false, canRemind: true, ...entry }],
    },
  };
}

function textOf(node: { children: unknown[] }): string {
  return node.children.map((c) => (typeof c === "string" ? c : textOf(c as { children: unknown[] }))).join("");
}

beforeEach(() => {
  api.sendProfileReminder.mockReset();
});

describe("ProfileIncompleteBlock (iOS)", () => {
  it("sends once, then shows 'sent today' disabled", async () => {
    api.sendProfileReminder.mockResolvedValue({ ok: true });
    const n = await renderNative(createElement(ProfileIncompleteBlock, { block: block() }));
    expect(n.byTestId("profile-incomplete-remind-7").props.disabled).toBeFalsy();

    await n.press("profile-incomplete-remind-7");
    await n.flush();

    expect(api.sendProfileReminder).toHaveBeenCalledWith(7);
    expect(n.queryByTestId("profile-incomplete-remind-7")).toBeNull();
    expect(n.byTestId("profile-incomplete-reminded-7").props.disabled).toBe(true);
  });

  it("a second device's 409 already_reminded also lands on 'sent today'", async () => {
    api.sendProfileReminder.mockRejectedValue({ response: { data: { code: "already_reminded" } } });
    const n = await renderNative(createElement(ProfileIncompleteBlock, { block: block() }));
    await n.press("profile-incomplete-remind-7");
    await n.flush();
    expect(n.byTestId("profile-incomplete-reminded-7").props.disabled).toBe(true);
  });

  it("starts disabled when the server says it was sent today", async () => {
    const n = await renderNative(createElement(ProfileIncompleteBlock, { block: block({ remindedToday: true }) }));
    expect(n.byTestId("profile-incomplete-reminded-7").props.disabled).toBe(true);
  });

  it("a blocked pair gets the explanation and no button", async () => {
    const n = await renderNative(createElement(ProfileIncompleteBlock, { block: block({ canRemind: false }) }));
    expect(n.queryByTestId("profile-incomplete-body-7")).not.toBeNull();
    expect(n.queryByTestId("profile-incomplete-remind-7")).toBeNull();
    expect(n.queryByTestId("profile-incomplete-reminded-7")).toBeNull();
  });

  it.each([
    [["level"], "dashboard.profileCompleteness.studentBodyLevel"],
    [["side"], "dashboard.profileCompleteness.studentBodySide"],
    [["level", "side"], "dashboard.profileCompleteness.studentBodyBoth"],
  ] as const)("names what is missing: %j", async (missing, key) => {
    const n = await renderNative(createElement(ProfileIncompleteBlock, { block: block({ missing: [...missing] }) }));
    expect(textOf(n.byTestId("profile-incomplete-body-7") as never)).toBe(key);
  });
});
