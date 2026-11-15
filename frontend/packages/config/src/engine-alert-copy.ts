/**
 * PAD-920 (dashboard.blocks NA2): the coach alert card's words, the same on web (`NeedsYouQueue`) and
 * iOS (`blocks.tsx`). The line names the side only when the spot type has one.
 */
import type { DashboardNeedsYouEngineAlert } from "@levelup/types";
import { classDayParts, type I18nText } from "./invite-simulation";

export interface EngineAlertCopy {
  titleKey: string;
  line: I18nText;
  hintKey: string;
  testId: string;
}

const SIDE_KEY = {
  left: "dashboard.needsYou.engineAlert.sideLeft",
  right: "dashboard.needsYou.engineAlert.sideRight",
} as const;

export function engineAlertCopy(item: DashboardNeedsYouEngineAlert, language: string | undefined): EngineAlertCopy {
  const { weekday } = classDayParts(item.date, language);
  const params = { count: item.count, class: item.classTitle, weekday, time: item.startTime };
  const line: I18nText = item.side
    ? { key: "dashboard.needsYou.engineAlert.lineSided", params: { ...params, sideKey: SIDE_KEY[item.side] } }
    : { key: "dashboard.needsYou.engineAlert.line", params };
  return {
    titleKey: "dashboard.needsYou.engineAlert.title",
    line,
    hintKey: "dashboard.needsYou.engineAlert.hint",
    testId: `needs-you-engine-alert-${item.lessonInstanceId}-${item.side ?? "either"}`,
  };
}
