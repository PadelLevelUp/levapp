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

function safeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Date.now() + Math.floor(Math.random() * 1000));
}

const COACH_ID = "1"; // TODO: replace with auth context

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

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
      const [playersData, levelsData] = await Promise.all([
        getCoachPlayers(COACH_ID),
        getCoachLevels(COACH_ID),
      ]);

      setCoachPlayers(playersData);
      setLevels(levelsData);
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

  const coachId = COACH_ID;

  const handleAddPlayer = (data: AddPlayerInput) => {
    const player: Player = {
      id: safeId(),
      userId: safeId(),
    };

    const level = data.levelId ? levels.find((l) => l.id === data.levelId) : undefined;

    const newCoachPlayer: CoachPlayer = {
      id: safeId(),
      coachId,
      name: data.name,
      email: data.email,
      username: data.username,
      playerId: player.id,
      levelId: data.levelId,
      side: data.side,
      notes: data.notes,
      level,
    };

    setCoachPlayers((prev) => [newCoachPlayer, ...prev]);
  };

  const handleEditSave = (data: EditPlayerInput) => {
    if (!selected) return;
    
    const level = data.levelId ? levels.find((l) => l.id === data.levelId) : undefined;

    setCoachPlayers((prev) =>
      prev.map((cs) => {
        if (cs.id !== selected.id) return cs;

        return {
          ...cs,
          levelId: data.levelId,
          side: data.side,
          notes: data.notes,
          name: data.name,
          email: data.email,
          phone: data.phone,
          level,
        };
      })
    );

    setSelected(null);
  };

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
                key={cs.id}
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
            email: selected?.email ?? "",
            phone: selected?.phone ?? "",
            levelId: selected?.levelId,
            side: selected?.side,
            notes: selected?.notes,
          }}
        />
      </div>
    </AppLayout>
  );
}
