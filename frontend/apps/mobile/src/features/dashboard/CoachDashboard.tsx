/**
 * The coach dashboard on iOS.
 *
 * Renders the SAME four blocks as the web coach home, from the same payload,
 * as a single priority-ordered stack:
 *
 *   hero → needs-you → next 7 days → this week
 *
 * The blocks themselves live in `./blocks` since PAD-202, shared with the
 * student home. The greeting and date live in the navy app bar (see
 * app/(tabs)/_layout.tsx), which is why there is no in-screen title here.
 */
import { greetingKey, longDate, todayISO } from "@levelup/config";
import type { DashboardBlock } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { NeedsYouQueue, NextClassHero, Schedule7Days, WeekPulse } from "./blocks";

export function pick<T extends DashboardBlock["type"]>(blocks: DashboardBlock[], type: T) {
  return blocks.find((b): b is Extract<DashboardBlock, { type: T }> => b.type === type);
}

export function CoachDashboard({ blocks }: { blocks: DashboardBlock[] }) {
  const hero = pick(blocks, "next_class");
  const needsYou = pick(blocks, "needs_you");
  const schedule = pick(blocks, "schedule_7d");
  const pulse = pick(blocks, "week_pulse");

  return (
    <View className="gap-5" testID="coach-dashboard">
      {hero && <NextClassHero block={hero} />}
      {needsYou && <NeedsYouQueue block={needsYou} />}
      {schedule && <Schedule7Days block={schedule} />}
      {pulse && <WeekPulse block={pulse} />}
    </View>
  );
}

/** Greeting + date for the navy app bar. Exported so the tab layout can render
 * it in the header rather than the screen repeating a title. */
export function useHeaderGreeting(firstName: string) {
  const { t, i18n } = useTranslation();
  return {
    greeting: t(`dashboard.greeting.${greetingKey()}`, { name: firstName }),
    date: longDate(todayISO(), i18n.language),
  };
}
