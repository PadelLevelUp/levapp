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
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { KpiTiles, NeedsYouQueue, NextClassHero, Schedule7Days } from "./blocks";
import { pick } from "./CoachDashboard";

export function StudentDashboard({ blocks }: { blocks: DashboardBlock[] }) {
  const hero = pick(blocks, "next_class");
  const needsYou = pick(blocks, "needs_you");
  const schedule = pick(blocks, "schedule_7d");
  const kpis = pick(blocks, "kpi_grid");
  const { t } = useTranslation();

  // players.join-token rule 8: no next class and an empty week is what a
  // student nobody has picked up yet looks like — offer the Connect screen.
  const looksUnconnected = !hero && (schedule?.data.items.length ?? 0) === 0;

  return (
    <View className="gap-5" testID="student-dashboard">
      {looksUnconnected ? (
        <View
          className="gap-2 rounded-xl border border-dashed border-border p-4"
          testID="student-connect-prompt"
        >
          <Text className="text-sm text-muted-foreground">{t("players.connect.dashboardPrompt")}</Text>
          <Button
            variant="outline"
            size="sm"
            testID="student-connect-link"
            onPress={() => router.push("/connect")}
          >
            <Text>{t("players.connect.dashboardLink")}</Text>
          </Button>
        </View>
      ) : null}
      {hero && <NextClassHero block={hero} />}
      {needsYou && <NeedsYouQueue block={needsYou} />}
      {schedule && <Schedule7Days block={schedule} role="student" />}
      {kpis && <KpiTiles block={kpis} />}
    </View>
  );
}
