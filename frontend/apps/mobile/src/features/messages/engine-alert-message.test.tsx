/**
 * PAD-920 (dashboard.blocks NA3, DASHBOARD-BLOCKS-53): the coach alert's `engine_alert` message links
 * to its class on iOS, from the message's `href` (the dashboard's class_href shape) when it has one,
 * else from its `lessonInstanceId`.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { EngineAlertLink } from "./components/engine-alert-link";
import { engineAlertClassRoute } from "./engine-message";

describe("the engine_alert message on iOS", () => {
  it("[DASHBOARD-BLOCKS-53] links the alert message to its class", async () => {
    // From `href`: the class, its occurrence and date, as the dashboard's card opens it.
    const withHref = { engine: "new", lessonInstanceId: 901, href: "/calendar?classId=lessoninstance-901&date=2026-11-19" };
    expect(engineAlertClassRoute(withHref)).toMatchObject({
      pathname: "/class/[id]",
      params: { id: "lessoninstance-901", model: "LessonInstance", originalId: "901", date: "2026-11-19" },
    });
    // No `href` (an older message): the instance id alone, which the class screen resolves.
    expect(engineAlertClassRoute({ engine: "new", lessonInstanceId: 7 })).toEqual({
      pathname: "/class/[id]",
      params: { id: "lessoninstance-7" },
    });
    // Not an engine message, or no class named: no link.
    expect(engineAlertClassRoute({ lessonInstanceId: 7 })).toBeNull();
    expect(engineAlertClassRoute({ engine: "new" })).toBeNull();

    const onOpenClass = vi.fn();
    const r = await renderNative(<EngineAlertLink messageId={30} metadata={withHref} onOpenClass={onOpenClass} />);
    await r.press("engine-alert-open-class-30");
    expect(onOpenClass.mock.calls[0][0]).toMatchObject({ pathname: "/class/[id]", params: { id: "lessoninstance-901" } });
    const none = await renderNative(<EngineAlertLink messageId={31} metadata={{ engine: "new" }} onOpenClass={onOpenClass} />);
    expect(none.queryByTestId("engine-alert-open-class-31")).toBeNull();
  });
});
