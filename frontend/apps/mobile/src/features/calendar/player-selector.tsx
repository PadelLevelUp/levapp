import { Ionicons } from "@expo/vector-icons";
import { lightTheme, lightThemeHsl } from "@levelup/config";
import type { CoachLevel, CoachPlayer } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

import {
  filterPlayers,
  isOutOfLevel,
  selectedPlayersOf,
} from "./player-selector-logic";

interface PlayerSelectorProps {
  players: CoachPlayer[];
  levels: CoachLevel[];
  selectedPlayerIds: string[];
  classLevelId?: string | null;
  onToggle: (playerId: string) => void;
}

type Tab = "participants" | "all";

/** A theme colour at an alpha, from its "H S% L%" triple. */
const tint = (hsl: string, alpha: number) => `hsla(${hsl.split(" ").join(", ")}, ${alpha})`;

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

/**
 * Mobile port of web's `components/calendar/PlayerSelector.tsx`
 * (classes.create rule 10, classes.edit rule 9, PAD-474): the coach's chosen
 * students on one tab, every student on the other with a search, level chips
 * and a mark on anyone outside the class's level. No cap at `maxPlayers` —
 * the tab label carries the count, as on web.
 *
 * Used on pushed screens (new class, class detail), never inside a native
 * Modal. The two tabs are equal-width columns, so the count changing never
 * moves them; selected states are drawn with inline `style`.
 */
export function PlayerSelector({
  players,
  levels,
  selectedPlayerIds,
  classLevelId,
  onToggle,
}: PlayerSelectorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<Tab>("participants");
  const [search, setSearch] = React.useState("");
  const [filterLevelId, setFilterLevelId] = React.useState<string | null>(null);

  const isSearching = search.trim().length > 0;
  const selectedIds = React.useMemo(
    () => new Set(selectedPlayerIds.map(String)),
    [selectedPlayerIds]
  );
  const selected = React.useMemo(
    () => selectedPlayersOf(players, selectedPlayerIds),
    [players, selectedPlayerIds]
  );
  const visible = React.useMemo(
    () => filterPlayers(players, { search, levelId: filterLevelId }),
    [players, search, filterLevelId]
  );
  const levelTabs = React.useMemo(
    () => [
      { id: null as string | null, label: t("calendar.playerSelector.all") },
      ...levels.map((l) => ({ id: String(l.id) as string | null, label: l.code })),
    ],
    [levels, t]
  );

  const levelCode = (player: CoachPlayer) =>
    player.level?.code ??
    levels.find((l) => String(l.id) === String(player.levelId))?.code;

  const renderRow = (player: CoachPlayer) => {
    const playerId = String(player.playerId);
    const isSelected = selectedIds.has(playerId);
    const outOfLevel = isOutOfLevel(player, classLevelId);
    return (
      <Pressable
        key={playerId}
        testID={`player-selector-row-${playerId}`}
        accessibilityLabel={player.name}
        role="checkbox"
        accessibilityState={{ checked: isSelected }}
        onPress={() => onToggle(playerId)}
        className="flex-row items-center gap-3 rounded-lg p-2"
        style={{
          backgroundColor: isSelected
            ? tint(outOfLevel ? lightThemeHsl.warning : lightThemeHsl.primary, outOfLevel ? 0.15 : 0.1)
            : undefined,
          opacity: outOfLevel && !isSelected ? 0.75 : 1,
        }}
      >
        <Ionicons
          name={isSelected ? "checkbox" : "square-outline"}
          size={20}
          color={isSelected ? lightTheme.primary : lightTheme.mutedForeground}
        />
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-xs font-medium">{getInitials(player.name)}</Text>
        </View>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="flex-shrink text-sm" numberOfLines={1}>
            {player.name}
          </Text>
          {outOfLevel ? (
            <View className="rounded-full border border-warning/50 bg-warning/10 px-1.5 py-0.5">
              <Text className="text-[10px] text-warning">
                {levelCode(player) ?? t("calendar.playerSelector.noLevel")}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const tabButton = (value: Tab, label: string) => {
    const active = tab === value;
    return (
      <Pressable
        testID={`player-selector-tab-${value}`}
        accessibilityLabel={label}
        role="tab"
        accessibilityState={{ selected: active }}
        onPress={() => setTab(value)}
        className="flex-1 items-center rounded-md py-1.5"
        style={{ backgroundColor: active ? lightTheme.card : "transparent" }}
      >
        <Text
          className="text-sm font-medium"
          numberOfLines={1}
          style={{ color: active ? lightTheme.foreground : lightTheme.mutedForeground }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View testID="player-selector" className="gap-2">
      <View className="flex-row rounded-lg bg-muted p-1">
        {tabButton(
          "participants",
          t("calendar.playerSelector.participants", { count: selectedPlayerIds.length })
        )}
        {tabButton("all", t("calendar.playerSelector.all"))}
      </View>

      {tab === "participants" ? (
        selected.length === 0 ? (
          <Text className="py-4 text-center text-sm text-muted-foreground">
            {t("calendar.playerSelector.noParticipantsSelected")}
          </Text>
        ) : (
          <ScrollView
            style={{ maxHeight: 260 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-1">{selected.map(renderRow)}</View>
          </ScrollView>
        )
      ) : (
        <View className="gap-3">
          <Input
            testID="player-selector-search"
            placeholder={t("calendar.playerSelector.searchPlaceholder")}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!isSearching ? (
            <View className="flex-row flex-wrap gap-1.5">
              {levelTabs.map((level) => {
                const active = filterLevelId === level.id;
                return (
                  <Pressable
                    key={level.id ?? "all"}
                    testID={`player-selector-level-${level.id ?? "all"}`}
                    accessibilityLabel={level.label}
                    role="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilterLevelId(level.id)}
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: active ? lightTheme.primary : lightTheme.muted }}
                  >
                    <Text
                      className="text-xs font-medium"
                      style={{
                        color: active
                          ? lightTheme.primaryForeground
                          : lightTheme.mutedForeground,
                      }}
                    >
                      {level.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <ScrollView
            style={{ maxHeight: 260 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-1">
              {visible.length === 0 ? (
                <Text className="py-3 text-center text-sm text-muted-foreground">
                  {t("calendar.playerSelector.noPlayersFound")}
                </Text>
              ) : (
                visible.map(renderRow)
              )}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
