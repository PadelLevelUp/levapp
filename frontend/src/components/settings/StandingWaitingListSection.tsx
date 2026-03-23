import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getStandingWaitingList, removeFromStandingWaitingList, searchPlayers } from "@/api/notificationEngine";
import { AddToStandingWaitingListDialog } from "@/components/players/AddToStandingWaitingListDialog";
import type { StandingWaitingListEntry } from "@/types";

export function StandingWaitingListSection() {
  const [entries, setEntries] = useState<StandingWaitingListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null);

  // Player search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStandingWaitingList()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchOpen(false);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    setSearching(true);
    searchRef.current = setTimeout(async () => {
      try {
        const data = await searchPlayers(query);
        setResults(data.players);
        setSearchOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  const handleSelectPlayer = (p: { id: string; name: string }) => {
    setSelectedPlayer({ id: Number(p.id), name: p.name });
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setDialogOpen(true);
  };

  const handleAdded = (entry: StandingWaitingListEntry) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.playerId !== entry.playerId);
      return [...filtered, entry];
    });
    setSelectedPlayer(null);
  };

  const handleRemove = async (entryId: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    try {
      await removeFromStandingWaitingList(entryId);
    } catch {
      // Reload on failure
      getStandingWaitingList().then(setEntries);
    }
  };

  const formatExpiry = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Player search */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search player to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm h-8"
          />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        {searchOpen && results.length > 0 && (
          <div className="absolute z-10 top-9 left-0 right-0 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                onClick={() => handleSelectPlayer(p)}
              >
                <UserPlus className="w-3 h-3 text-muted-foreground" />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No students on the standing waiting list.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.playerName ?? "Unknown"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {entry.creditsUsed}/{entry.creditsTotal} credits
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Expires {formatExpiry(entry.expiresAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.activeClassCount} {entry.activeClassCount === 1 ? "class" : "classes"}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(entry.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectedPlayer && (
        <AddToStandingWaitingListDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setSelectedPlayer(null); }}
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
