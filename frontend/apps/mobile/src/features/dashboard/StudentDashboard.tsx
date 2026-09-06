/**
 * The student dashboard on iOS (PAD-202).
 *
 * The same blocks as the coach home — hero, needs-you queue, the week ahead —
 * plus the student's four numbers, in one priority-ordered stack:
 *
 *   hero → needs-you → next 7 days → your record
 *
 * The greeting and date live in the navy app bar for every role, so there is
 * no in-screen title here either.
 */
import type { DashboardBlock } from "@levelup/types";
import * as React from "react";
import { View } from "react-native";
import { KpiTiles, NeedsYouQueue, NextClassHero, Schedule7Days } from "./blocks";
import { pick } from "./CoachDashboard";

export function StudentDashboard({ blocks }: { blocks: DashboardBlock[] }) {
  const hero = pick(blocks, "next_class");
  const needsYou = pick(blocks, "needs_you");
  const schedule = pick(blocks, "schedule_7d");
  const kpis = pick(blocks, "kpi_grid");

  return (
    <View className="gap-5" testID="student-dashboard">
      {hero && <NextClassHero block={hero} />}
      {needsYou && <NeedsYouQueue block={needsYou} />}
      {schedule && <Schedule7Days block={schedule} role="student" />}
      {kpis && <KpiTiles block={kpis} />}
    </View>
  );
}
