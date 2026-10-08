import { useMemo, useRef, useState } from "react";
import { nameMatchesQuery } from "@levelup/config";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CoachPlayer, CoachLevel } from "@/types";

interface PlayerSelectorProps {
  players: CoachPlayer[];
  levels: CoachLevel[];
  selectedPlayerIds: string[];
  classLevelId?: string | null;
  onToggle: (playerId: string) => void;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);


export function PlayerSelector({
  players,
  levels,
  selectedPlayerIds,
  classLevelId,
  onToggle,
}: PlayerSelectorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  // PAD-518 (classes.create rule 10): picking a student from search results clears the
  // search and keeps the cursor in the field, so the coach can type the next name at once.
  const searchRef = useRef<HTMLInputElement>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);

  const isSearching = search.trim().length > 0;
  const normalizedClassLevelId = classLevelId ? String(classLevelId) : null;
  const normalizedSelectedPlayerIds = useMemo(
    () => new Set(selectedPlayerIds.map((id) => String(id))),
    [selectedPlayerIds]
  );

  const getPlayerLevel = (player: CoachPlayer) =>
    player.level ?? levels.find((level) => String(level.id) === String(player.levelId));

  const selectedPlayers = useMemo(
    () => players.filter((p) => normalizedSelectedPlayerIds.has(String(p.playerId))),
    [players, normalizedSelectedPlayerIds]
  );

  const allPlayers = useMemo(() => {
    let result = players;

    if (isSearching) {
      // PAD-516: every typed word, in any order (shared with iOS).
      result = result.filter((p) => nameMatchesQuery(p.name, search));
    } else if (filterLevelId) {
      result = result.filter((p) => String(p.levelId) === String(filterLevelId));
    }

    return result;
  }, [players, search, filterLevelId, isSearching]);

  const levelTabs = useMemo(() => {
    const allLevels = [{ id: null, label: t("calendar.playerSelector.all") }, ...levels.map((l) => ({ id: l.id, label: l.code }))];
    return allLevels;
  }, [levels, t]);

  return (
    <Tabs defaultValue="participants">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="participants">
          {t("calendar.playerSelector.participants", { count: selectedPlayerIds.length })}
        </TabsTrigger>
        <TabsTrigger value="all" data-testid="player-selector-tab-all">{t("calendar.playerSelector.all")}</TabsTrigger>
      </TabsList>

      {/* Selected participants tab */}
      <TabsContent value="participants" className="mt-2">
        {selectedPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("calendar.playerSelector.noParticipantsSelected")}
          </p>
        ) : (
          <div className="max-h-52 overflow-y-auto overscroll-contain" data-testid="player-selector-selected-list">
            {/* PAD-502: a native scroller, as in the list of all students below. */}
            <div className="space-y-1">
              {selectedPlayers.map((player) => {
                const playerId = String(player.playerId);
                return (
                  <div
                    key={playerId}
                    data-testid={`player-selector-selected-${playerId}`}
                    onClick={() => onToggle(playerId)}
                    className="flex items-center gap-3 p-2 rounded-lg cursor-pointer bg-primary/10 hover:bg-primary/15 transition-colors"
                  >
                    <Checkbox checked />
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {getInitials(player.name)}
                    </div>
                    <span className="text-sm truncate flex-1">{player.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </TabsContent>

      {/* All students tab */}
      <TabsContent value="all" className="space-y-3 mt-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            data-testid="player-selector-search"
            placeholder={t("calendar.playerSelector.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Level filter tabs */}
        {!isSearching && (
          <div className="flex gap-1.5 flex-wrap">
            {levelTabs.map((tab) => (
              <button
                key={tab.id ?? "all"}
                data-testid={`player-selector-level-${tab.id ?? "all"}`}
                onClick={() => setFilterLevelId(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  filterLevelId === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Player list */}
        {/* PAD-502 (B-271): a native scroller, not Radix ScrollArea. With only a max height on
            its root, ScrollArea's viewport grew to the full list and the root clipped it at 208 px:
            four rows, and nothing to scroll. Any list longer than four was cut, which a coach met
            as "only four players for this level". Same family as B-202 (PAD-439). */}
        <div className="max-h-52 overflow-y-auto overscroll-contain" data-testid="player-selector-list">
          <div className="space-y-1">
            {allPlayers.length === 0 && (
              <p className="text-sm text-muted-foreground py-3 text-center">
                {t("calendar.playerSelector.noPlayersFound")}
              </p>
            )}

            {allPlayers.map((player) => {
              const playerId = String(player.playerId);
              const playerLevel = getPlayerLevel(player);
              const selected = normalizedSelectedPlayerIds.has(playerId);
              const isOutOfLevel =
                normalizedClassLevelId !== null &&
                String(player.levelId) !== normalizedClassLevelId;

              return (
                <div
                  key={playerId}
                  data-testid={`player-selector-row-${playerId}`}
                  onClick={() => {
                    onToggle(playerId);
                    if (isSearching && !selected) {
                      setSearch("");
                      searchRef.current?.focus();
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                    selected && !isOutOfLevel && "bg-primary/10",
                    selected && isOutOfLevel && "bg-warning/15",
                    !selected && "hover:bg-muted",
                    isOutOfLevel && !selected && "opacity-75"
                  )}
                >
                  <Checkbox checked={selected} />
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {getInitials(player.name)}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm truncate">{player.name}</span>
                    {isOutOfLevel && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-warning/50 text-warning bg-warning/10 shrink-0"
                      >
                        {playerLevel?.code ?? t("calendar.playerSelector.noLevel")}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
