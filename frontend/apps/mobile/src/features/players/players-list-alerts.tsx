/**
 * players.list rules 5, 15 (PAD-834): the roster's two alerts, which are its filters, and the
 * pending and needs-configuring cues on a row. The web twin lives in `PlayersPage.tsx`; the
 * ids, the tones and the i18n keys are the same.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme, pendingAgeLabel, type RosterFilter } from "@levelup/config";
import type { CoachPlayer } from "@levelup/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** violet-600: "registo pendente" is not amber (the ticket's design uses lilac). */
export const PENDING_TONE = "#7c3aed";

const ACTIVE_LABEL_KEYS: Record<RosterFilter, string> = {
  pending: "players.card.pendingFilterActive",
  incomplete: "players.incompleteFilterActive",
  missing_level: "players.missingLevelFilterActive",
  missing_side: "players.missingSideFilterActive",
};

export function RosterAlerts({
  incomplete,
  pending,
  filter,
  onToggle,
  onClear,
}: {
  incomplete: number;
  pending: number;
  filter: RosterFilter | null;
  onToggle: (filter: RosterFilter) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {incomplete > 0 || pending > 0 ? (
        <View className="gap-2">
          {incomplete > 0 ? (
            <Pressable
              testID="players-alert-incomplete"
              accessibilityLabel={t("players.card.alertIncomplete", { count: incomplete })}
              accessibilityState={{ selected: filter === "incomplete" }}
              role="button"
              onPress={() => onToggle("incomplete")}
              className={cn(
                "flex-row items-center gap-2 rounded-md border p-3",
                filter === "incomplete" ? "border-warning bg-warning/10" : "border-border bg-card",
              )}
            >
              <Ionicons name="warning-outline" size={16} color={lightTheme.warning} />
              <Text className="flex-1 text-sm">{t("players.card.alertIncomplete", { count: incomplete })}</Text>
            </Pressable>
          ) : null}
          {pending > 0 ? (
            <Pressable
              testID="players-alert-pending"
              accessibilityLabel={t("players.card.alertPending", { count: pending })}
              accessibilityState={{ selected: filter === "pending" }}
              role="button"
              onPress={() => onToggle("pending")}
              className={cn(
                "flex-row items-center gap-2 rounded-md border border-violet-300 p-3",
                filter === "pending" ? "bg-violet-100" : "bg-card",
              )}
            >
              <Ionicons name="person-add-outline" size={16} color={PENDING_TONE} />
              <Text className="flex-1 text-sm">{t("players.card.alertPending", { count: pending })}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {filter ? (
        <View className="flex-row items-center gap-2">
          <Badge variant="secondary" testID="players-filter-active">
            <Text>{t(ACTIVE_LABEL_KEYS[filter])}</Text>
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            testID="players-filter-clear"
            accessibilityLabel={t("players.clearFilterAriaLabel")}
            onPress={onClear}
          >
            <Text>{t("players.card.seeAll")}</Text>
          </Button>
        </View>
      ) : null}
    </>
  );
}

/** The chips a row adds: "Sem nível" / "Sem lado" (amber) and "Pendente · há X dias". */
export function PlayerRowStates({ player, now }: { player: CoachPlayer; now?: Date }) {
  const { t } = useTranslation();
  const age = player.pendingRegistration === true ? pendingAgeLabel(player.addedAt, now) : null;
  return (
    <>
      {!player.levelId ? (
        <Badge variant="outline" className="border-warning/40 bg-warning/10" testID="player-row-no-level">
          <Text className="text-warning-strong">{t("players.card.noLevel")}</Text>
        </Badge>
      ) : null}
      {!player.side ? (
        <Badge variant="outline" className="border-warning/40 bg-warning/10" testID="player-row-no-side">
          <Text className="text-warning-strong">{t("players.card.noSide")}</Text>
        </Badge>
      ) : null}
      {age ? (
        <Badge variant="outline" className="border-violet-300" testID="pending-registration-badge">
          <Text className="text-violet-700">{t(age.key, age.values)}</Text>
        </Badge>
      ) : null}
    </>
  );
}
