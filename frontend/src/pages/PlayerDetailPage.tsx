import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCoachPlayers } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { getPlayerProfile } from "@/api/playerProfile";
import { editPlayer } from "@/api/players";
import type { CoachPlayer, CoachLevel, PlayerProfile } from "@/types";
import { EditPlayerSheet, type EditPlayerInput } from "@/components/players/EditPlayerSheet";
import { PlayerHeader } from "@/components/players/detail/PlayerHeader";
import { PlayerEvaluations } from "@/components/players/detail/PlayerEvaluations";
import { PlayerStrengthsWeaknesses } from "@/components/players/detail/PlayerStrengthsWeaknesses";
import { PlayerInfoCard } from "@/components/players/detail/PlayerInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  const [player, setPlayer] = useState<CoachPlayer | null>(null);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [playersData, levelsData] = await Promise.all([
          getCoachPlayers(),
          getCoachLevels(),
        ]);
        setLevels(levelsData);

        const found = playersData.find((p) => p.playerId === playerId);
        setPlayer(found ?? null);

        if (found) {
          const profileData = await getPlayerProfile(found.playerId);
          setProfile(profileData);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  const handleEditSave = async (data: EditPlayerInput) => {
    if (!player) return;
    const prev = player;
    const level = data.levelId ? levels.find((l) => l.id === data.levelId) : undefined;

    const updated: CoachPlayer = {
      ...player,
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

    setPlayer(updated);
    setIsEditOpen(false);

    try {
      await editPlayer(player, data);
    } catch {
      setPlayer(prev);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Button variant="ghost" onClick={() => navigate("/players")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to players
          </Button>
          <p className="text-muted-foreground">Player not found.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/players")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to players
        </Button>

        <PlayerHeader player={player} levels={levels} onEdit={() => setIsEditOpen(true)} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PlayerEvaluations evaluations={profile?.evaluations ?? []} />
            <PlayerStrengthsWeaknesses
              strengths={profile?.strengths ?? []}
              weaknesses={profile?.weaknesses ?? []}
            />
          </div>
          <div>
            <PlayerInfoCard player={player} levels={levels} />
          </div>
        </div>

        <EditPlayerSheet
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={handleEditSave}
          levels={levels}
          initialValues={{
            name: player.name ?? "",
            username: player.username ?? "",
            userId: player.userId ?? "",
            email: player.email ?? "",
            phone: player.phone ?? "",
            levelId: player.levelId,
            side: player.side,
            notes: player.notes,
            isActive: player.isActive,
          }}
        />
      </div>
    </AppLayout>
  );
}
