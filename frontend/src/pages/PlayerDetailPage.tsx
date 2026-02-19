import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCoachPlayers } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { getPlayerProfile } from "@/api/playerProfile";
import { getEvaluationCategories, postEvaluationEntry } from "@/api/evaluation";
import { editPlayer } from "@/api/players";
import type { CoachPlayer, CoachLevel, PlayerProfile, EvaluationCategory } from "@/types";
import { EditPlayerSheet, type EditPlayerInput } from "@/components/players/EditPlayerSheet";
import { AddEvaluationSheet } from "@/components/players/detail/AddEvaluationSheet";
import { PlayerHeader } from "@/components/players/detail/PlayerHeader";
import { PlayerEvaluations } from "@/components/players/detail/PlayerEvaluations";
import { PlayerStrengthsWeaknesses } from "@/components/players/detail/PlayerStrengthsWeaknesses";
import { PlayerInfoCard } from "@/components/players/detail/PlayerInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  const [player, setPlayer] = useState<CoachPlayer | null>(null);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [categories, setCategories] = useState<EvaluationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEvalOpen, setIsEvalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [playersData, levelsData, cats] = await Promise.all([
          getCoachPlayers(),
          getCoachLevels(),
          getEvaluationCategories(),
        ]);
        setLevels(levelsData);
        setCategories(cats);

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

  const handleEvalSave = async (data: {
    scores: { categoryId: string; value: number }[];
    strengths: string[];
    weaknesses: string[];
  }) => {
    if (!player) return;

    // Optimistic update
    const newEvaluations = data.scores.map((s) => {
      const cat = categories.find((c) => c.id === s.categoryId);
      return { topic: cat?.name ?? s.categoryId, score: s.value };
    });

    setProfile((prev) => ({
      playerId: player.playerId,
      evaluations: newEvaluations,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      ...(prev ? {} : {}),
    }));

    try {
      await postEvaluationEntry({
        playerId: player.playerId,
        scores: data.scores,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
      });
    } catch {
      // Could revert here
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
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/players")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to players
          </Button>
          <Button size="sm" onClick={() => setIsEvalOpen(true)}>
            <ClipboardPlus className="mr-2 h-4 w-4" /> Add Evaluation
          </Button>
        </div>

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

        <AddEvaluationSheet
          open={isEvalOpen}
          onClose={() => setIsEvalOpen(false)}
          onSave={handleEvalSave}
          categories={categories}
          currentEvaluations={profile?.evaluations ?? []}
          currentStrengths={profile?.strengths ?? []}
          currentWeaknesses={profile?.weaknesses ?? []}
        />
      </div>
    </AppLayout>
  );
}
