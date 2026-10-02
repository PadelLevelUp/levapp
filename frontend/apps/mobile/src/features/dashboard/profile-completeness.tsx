/**
 * dashboard.profile-completeness (PAD-486 coach block, PAD-490 student card), mirroring the web
 * IncompletePlayersBlock and ProfileIncompleteBlock: same copy, same order, same test ids.
 */
import { dashboardApi } from "@levelup/api";
import { profileIncompleteBodyKey } from "@levelup/config";
import type { DashboardIncompletePlayersBlock, DashboardProfileIncompleteBlock } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { go } from "./blocks";

function AttentionCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} className="rounded-2xl border border-border border-l-4 border-l-warning bg-card p-4">
      {children}
    </View>
  );
}

export function IncompletePlayersBlock({ block }: { block: DashboardIncompletePlayersBlock }) {
  const { t } = useTranslation();
  const { count, players, seeAllHref } = block.data;
  return (
    <AttentionCard testID="dashboard-incomplete-players">
      <View className="gap-1">
        <Text className="text-base font-semibold">
          {t("dashboard.profileCompleteness.coachTitle")}{" "}
          <Text className="text-muted-foreground" testID="dashboard-incomplete-players-count">({count})</Text>
        </Text>
        <Text className="text-sm text-muted-foreground">{t("dashboard.profileCompleteness.coachBody")}</Text>
      </View>
      <View className="mt-2">
        {players.map((p) => (
          <Pressable
            key={p.playerId}
            accessibilityRole="button"
            testID={`dashboard-incomplete-player-${p.playerId}`}
            onPress={() => go(p.href)}
            className="min-h-11 flex-row items-center justify-between gap-3 border-b border-border py-2"
          >
            <Text className="flex-1 text-sm font-medium" numberOfLines={1}>{p.name}</Text>
            <View className="flex-row gap-1.5">
              {p.missing.map((m) => (
                <View key={m} className="rounded-full bg-warning/15 px-2 py-0.5">
                  <Text className="text-xs font-medium text-warning">
                    {t(m === "level" ? "dashboard.profileCompleteness.noLevel" : "dashboard.profileCompleteness.noSide")}
                  </Text>
                </View>
              ))}
            </View>
          </Pressable>
        ))}
      </View>
      {count > players.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 self-start"
          testID="dashboard-incomplete-players-see-all"
          onPress={() => go(seeAllHref)}
        >
          <Text>{t("dashboard.profileCompleteness.seeAll")}</Text>
        </Button>
      ) : null}
    </AttentionCard>
  );
}

export function ProfileIncompleteBlock({ block }: { block: DashboardProfileIncompleteBlock }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sending, setSending] = React.useState<number | null>(null);
  const [sentNow, setSentNow] = React.useState<Set<number>>(new Set());
  const [failed, setFailed] = React.useState<number | null>(null);

  const remind = async (coachId: number) => {
    setSending(coachId);
    setFailed(null);
    try {
      await dashboardApi.sendProfileReminder(coachId);
      setSentNow((prev) => new Set(prev).add(coachId));
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "already_reminded") setSentNow((prev) => new Set(prev).add(coachId));
      else setFailed(coachId);
    } finally {
      setSending(null);
    }
  };

  return (
    <View className="gap-3" testID="dashboard-profile-incomplete">
      {block.data.coaches.map((c) => {
        const reminded = c.remindedToday || sentNow.has(c.coachId);
        return (
          <AttentionCard key={c.coachId} testID={`profile-incomplete-${c.coachId}`}>
            <View className="gap-2">
              <Text className="text-base font-semibold">{t("dashboard.profileCompleteness.studentTitle")}</Text>
              <Text className="text-sm text-muted-foreground" testID={`profile-incomplete-body-${c.coachId}`}>
                {t(profileIncompleteBodyKey(c.missing))}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("dashboard.profileCompleteness.studentCoach", { name: c.coachName })}
              </Text>
              {/* #523: no button for a blocked pair; the card still explains the cost. */}
              {c.canRemind !== false ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={reminded || sending === c.coachId}
                  testID={reminded ? `profile-incomplete-reminded-${c.coachId}` : `profile-incomplete-remind-${c.coachId}`}
                  onPress={() => void remind(c.coachId)}
                >
                  <Text>
                    {t(reminded ? "dashboard.profileCompleteness.reminded" : "dashboard.profileCompleteness.remind")}
                  </Text>
                </Button>
              ) : null}
              {failed === c.coachId ? (
                <Text className="text-sm text-destructive" accessibilityRole="alert">
                  {t("dashboard.profileCompleteness.remindFailed")}
                </Text>
              ) : null}
            </View>
          </AttentionCard>
        );
      })}
    </View>
  );
}
