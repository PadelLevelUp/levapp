import { Ionicons } from "@expo/vector-icons";
import { lightTheme, classLevelMatch } from "@levelup/config";
import type { CoachLevel, CoachPlayer } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { initialsOf } from "@/features/messages/utils";
import { cn } from "@/lib/utils";

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
  /** The coach's roster is still loading: say so instead of "no participants selected". */
  loading?: boolean;
  onToggle: (playerId: string) => void;
}

/**
 * Mobile port of web's `components/calendar/PlayerSelector.tsx`
 * (classes.create rule 10, classes.edit rule 9, PAD-474): the coach's chosen
 * students on one tab, every student on the other with a search, level chips
 * and a mark on anyone outside the class's level. No cap at `maxPlayers` —
 * the tab label carries the count, as on web.
 *
 * Used on pushed screens (new class, class detail), never inside a native
 * Modal. A row is one Pressable with a drawn check (as add-to-classes-dialog
 * does) because the `Checkbox` primitive is its own pressable and cannot sit
 * inside one.
 */
export function PlayerSelector({
  players,
  levels,
  selectedPlayerIds,
  classLevelId,
  loading = false,
  onToggle,
}: PlayerSelectorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState("participants");
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
        className={cn(
          "flex-row items-center gap-3 rounded-lg p-2",
          isSelected && (outOfLevel ? "bg-warning/15" : "bg-primary/10"),
          outOfLevel && !isSelected && "opacity-75"
        )}
      >
        <Ionicons
          name={isSelected ? "checkbox" : "square-outline"}
          size={20}
          color={isSelected ? lightTheme.primary : lightTheme.mutedForeground}
        />
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-xs font-medium">{initialsOf(player.name)}</Text>
        </View>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="flex-shrink text-sm" numberOfLines={1}>
            {player.name}
          </Text>
          {/* PAD-527: the level is always shown — primary when it is the class's level,
              amber when it is another (or none), neutral when the class has no level. */}
          {(() => {
            const match = classLevelMatch(player.levelId, classLevelId);
            const code = levelCode(player);
            if (match !== "other" && !code) return null;
            return (
              <View
                testID={`player-level-chip-${playerId}`}
                accessibilityLabel={`level-${match}`}
                className={cn(
                  "rounded-full border px-1.5 py-0.5",
                  match === "same" && "border-primary/50 bg-primary/10",
                  match === "other" && "border-warning/50 bg-warning/10",
                  match === "none" && "border-border bg-muted"
                )}
              >
                <Text
                  className={cn(
                    "text-[10px]",
                    match === "same" && "text-primary",
                    match === "other" && "text-warning",
                    match === "none" && "text-muted-foreground"
                  )}
                >
                  {code ?? t("calendar.playerSelector.noLevel")}
                </Text>
              </View>
            );
          })()}
        </View>
      </Pressable>
    );
  };

  return (
    <View testID="player-selector">
      <Tabs value={tab} onValueChange={setTab} className="gap-2">
        <TabsList>
          <TabsTrigger value="participants" testID="player-selector-tab-participants">
            <Text numberOfLines={1}>
              {t("calendar.playerSelector.participants", { count: selectedPlayerIds.length })}
            </Text>
          </TabsTrigger>
          <TabsTrigger value="all" testID="player-selector-tab-all">
            <Text numberOfLines={1}>{t("calendar.playerSelector.all")}</Text>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants">
          {loading ? (
            <View testID="player-selector-loading" className="items-center py-4">
              <Spinner />
            </View>
          ) : selected.length === 0 ? (
            <Text className="py-4 text-center text-sm text-muted-foreground">
              {t("calendar.playerSelector.noParticipantsSelected")}
            </Text>
          ) : (
            <ScrollView className="max-h-64" nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <View className="gap-1">{selected.map(renderRow)}</View>
            </ScrollView>
          )}
        </TabsContent>

        <TabsContent value="all" className="gap-3">
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
                    className={cn("rounded-full px-2.5 py-1", active ? "bg-primary" : "bg-muted")}
                  >
                    <Text
                      className={cn(
                        "text-xs font-medium",
                        active ? "text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {level.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <ScrollView className="max-h-64" nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
        </TabsContent>
      </Tabs>
    </View>
  );
}
