import { useMemo, useState } from "react";
import type { CoachPlayer, CoachLevel, Player} from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { useEffect } from "react";
import { getCoachPlayers } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { PlayersToolbar } from "@/components/players/PlayersToolbar";
import { AddPlayerSheet, type AddPlayerInput } from "@/components/players/AddPlayerSheet";
import { EditPlayerSheet, type EditPlayerInput } from "@/components/players/EditPlayerSheet";
import { LoadingPlayersGrid } from "@/components/ui/loading-skeleton";
import { addPlayer, editPlayer } from "@/api/players";
import { useAuth } from "@/auth/AuthContext";

function safeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Date.now() + Math.floor(Math.random() * 1000));
}

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [levels, setLevels] = useState<CoachLevel[]>([]);

  // edit state
  const [selected, setSelected] = useState<CoachPlayer | null>(null);
  const isEditOpen = !!selected;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coachPlayers;
    return coachPlayers.filter((cs) =>
      (cs.name ?? "").toLowerCase().includes(q)
    );
  }, [coachPlayers, search]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [playersData, levelsData] = await Promise.all([
          getCoachPlayers(),
          getCoachLevels(),
        ]);

        setCoachPlayers(playersData);
        setLevels(levelsData);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const handleAddPlayer = async (data: AddPlayerInput) => {
    const tempId = safeId();

    const level = data.levelId
      ? levels.find((l) => l.id === data.levelId)
      : undefined;

    const optimisticPlayer: CoachPlayer = {
      id: tempId,
      coachId: user.coachId,
      userId: 'temp',
      name: data.name,
      email: data.email,
      username: data.username,
      isActive: data.isActive,
      playerId: tempId,
      levelId: data.levelId,
      side: data.side,
      notes: data.notes,
      level,
    };

    setCoachPlayers((prev) => [optimisticPlayer, ...prev]);

    try {
      const created = await addPlayer({
        coachId: user?.coachId,
        ...data,
      });
      
      setCoachPlayers((prev) =>
        prev.map((p) => (p.id === tempId ? created : p))
      );
    } catch (err) {
      setCoachPlayers((prev) => prev.filter((p) => p.id !== tempId));
    }
  };


  const handleEditSave = async (data: EditPlayerInput) => {
    if (!selected) return;

    const prev = selected;

    const level = data.levelId
      ? levels.find((l) => l.id === data.levelId)
      : undefined;

    const updated: CoachPlayer = {
      ...selected,
      name: data.name,
      username: data.username,
      email: data.email,
      phone: data.phone,
      levelId: data.levelId,
      side: data.side,
      notes: data.notes,
      isActive: data.isActive,
      level,
    };

    setCoachPlayers((prevList) =>
      prevList.map((cs) => (cs.id === selected.id ? updated : cs))
    );

    setSelected(null);

    try {
      await editPlayer(selected, data);
    } catch (err) {
      setCoachPlayers((prevList) =>
        prevList.map((cs) => (cs.id === prev.id ? prev : cs))
      );
    }
  };

  if (loading) {
    return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <PlayersToolbar
          search={search}
          onSearchChange={setSearch}
          onAddPlayer={() => setIsAddOpen(true)}
        />
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
        <PlayersToolbar
          search={search}
          onSearchChange={setSearch}
          onAddPlayer={() => setIsAddOpen(true)}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cs) => {
            const level = cs.level;
            return (
              <Card
                  key={`coach-player-${cs.id}-${cs.playerId}`}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelected(cs)}
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
                      <p className="text-sm text-muted-foreground truncate">
                        {cs.email || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    {level && <Badge variant="outline">{level.code}</Badge>}
                    {cs.side && (
                      <Badge variant="secondary">
                        {cs.side === "left" ? "Left" : "Right"}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <AddPlayerSheet
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSave={handleAddPlayer}
          levels={levels}
        />

        <EditPlayerSheet
          open={isEditOpen}
          onClose={() => setSelected(null)}
          onSave={handleEditSave}
          levels={levels}
          initialValues={{
            name: selected?.name ?? "",
            username: selected?.username ?? "",
            userId: selected?.userId ?? "",
            email: selected?.email ?? "",
            phone: selected?.phone ?? "",
            levelId: selected?.levelId,
            side: selected?.side,
            notes: selected?.notes,
            isActive: selected?.isActive,
          }}
        />
      </div>
    </AppLayout>
  );
}
