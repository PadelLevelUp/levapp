import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [search, setSearch] = useState("");
  const [filterLevelId, setFilterLevelId] = useState<string | null>(
    classLevelId ?? null
  );

  useEffect(() => {
    setFilterLevelId(classLevelId ?? null);
  }, [classLevelId]);

  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .toLowerCase();

  const filteredPlayers = useMemo(() => {
    let result = players;

    if (isSearching) {
      const q = normalize(search);
      result = result.filter((p) => normalize(p.name).includes(q));
    } else if (filterLevelId) {
      result = result.filter((p) => p.levelId === filterLevelId);
    }

    return result;
  }, [players, search, filterLevelId, isSearching]);

  const levelTabs = useMemo(() => {
    const allLevels = [{ id: null, label: "All" }, ...levels.map((l) => ({ id: l.id, label: l.code }))];
    return allLevels;
  }, [levels]);

  return (
    <div className="space-y-3">
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
          {filteredPlayers.length === 0 && (
            <p className="text-sm text-muted-foreground py-3 text-center">
              No players found
            </p>
          )}

          {filteredPlayers.map((player) => {
            const selected = selectedPlayerIds.includes(player.playerId);
            const isOutOfLevel =
              isSearching && classLevelId && player.levelId !== classLevelId;

            return (
              <div
                key={player.playerId}
                onClick={() => onToggle(player.playerId)}
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
                      {player.level?.code ?? "Other level"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
