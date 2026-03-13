import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase();

export function PlayerSelector({
  players,
  levels,
  selectedPlayerIds,
  classLevelId,
  onToggle,
}: PlayerSelectorProps) {
  const [search, setSearch] = useState("");
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
      const q = normalize(search);
      result = result.filter((p) => normalize(p.name).includes(q));
    } else if (filterLevelId) {
      result = result.filter((p) => String(p.levelId) === String(filterLevelId));
    } else {
      result = result.slice(0, 25);
    }

    return result;
  }, [players, search, filterLevelId, isSearching]);

  const levelTabs = useMemo(() => {
    const allLevels = [{ id: null, label: "All" }, ...levels.map((l) => ({ id: l.id, label: l.code }))];
    return allLevels;
  }, [levels]);

  return (
    <Tabs defaultValue="participants">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="participants">
          Participants ({selectedPlayerIds.length})
        </TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
      </TabsList>

      {/* Selected participants tab */}
      <TabsContent value="participants" className="mt-2">
        {selectedPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No participants selected
          </p>
        ) : (
          <ScrollArea className="max-h-52">
            <div className="space-y-1">
              {selectedPlayers.map((player) => {
                const playerId = String(player.playerId);
                return (
                  <div
                    key={playerId}
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
          </ScrollArea>
        )}
      </TabsContent>

      {/* All students tab */}
      <TabsContent value="all" className="space-y-3 mt-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search player…"
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
        <ScrollArea className="max-h-52">
          <div className="space-y-1">
            {allPlayers.length === 0 && (
              <p className="text-sm text-muted-foreground py-3 text-center">
                No players found
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
                  onClick={() => onToggle(playerId)}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                    selected && !isOutOfLevel && "bg-primary/10",
                    selected && isOutOfLevel && "bg-amber-500/15",
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
                        className="text-[10px] border-amber-500/50 text-amber-600 bg-amber-500/10 shrink-0"
                      >
                        {playerLevel?.code ?? "No level"}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
