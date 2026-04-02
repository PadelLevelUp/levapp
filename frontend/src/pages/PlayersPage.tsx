import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { CoachPlayer, CoachLevel } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { getCoachPlayersPaginated, addPlayer } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { PlayersToolbar } from "@/components/players/PlayersToolbar";
import { AddPlayerSheet, type AddPlayerInput } from "@/components/players/AddPlayerSheet";
import { LoadingPlayersGrid } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext";

export default function PlayersPage() {
  const PAGE_SIZE = 25;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [levels, setLevels] = useState<CoachLevel[]>([]);

  // Debounce search input — reset page to 1 on new search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setCurrentPage(1);
    }, 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    async function loadLevels() {
      try {
        const levelsData = await getCoachLevels();
        setLevels(levelsData);
      } catch {
        // Keep empty levels on failure.
      }
    }
    loadLevels();
  }, []);

  useEffect(() => {
    async function loadPlayersPage() {
      setLoading(true);
      try {
        const searchParam = debouncedSearch || undefined;
        const playersData = await getCoachPlayersPaginated(currentPage, PAGE_SIZE, searchParam);
        setCoachPlayers(playersData.items);
        setTotalPages(playersData.pagination.pages || 1);
        setTotalItems(playersData.pagination.total || 0);
      } finally {
        setLoading(false);
      }
    }
    loadPlayersPage();
  }, [currentPage, debouncedSearch]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const handleAddPlayer = async (data: AddPlayerInput) => {
    try {
      await addPlayer({ coachId: user?.coachId, ...data });
      setCurrentPage(1);
      setLoading(true);
      const playersData = await getCoachPlayersPaginated(1, PAGE_SIZE);
      setCoachPlayers(playersData.items);
      setTotalPages(playersData.pagination.pages || 1);
      setTotalItems(playersData.pagination.total || 0);
    } catch {
      // Keep previous list if create fails.
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <PlayersToolbar search={search} onSearchChange={handleSearchChange} onAddPlayer={() => setIsAddOpen(true)} />
          <div className="relative h-full">
            <LoadingPlayersGrid />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <PlayersToolbar search={search} onSearchChange={handleSearchChange} onAddPlayer={() => setIsAddOpen(true)} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coachPlayers.map((cs) => {
            const level = cs.level;
            return (
              <Card
                key={`coach-player-${cs.id}-${cs.playerId}`}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/players/${cs.playerId}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(cs.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{cs.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{cs.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {level && <Badge variant="outline">{level.code}</Badge>}
                    {cs.side && (
                      <Badge variant="secondary">{cs.side === "left" ? "Left" : "Right"}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} • {totalItems} players
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        <AddPlayerSheet
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSave={handleAddPlayer}
          levels={levels}
        />
      </div>
    </AppLayout>
  );
}
