import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCoachPlayers, getPlayerProfile, addCoachNote, deleteCoachNote, editPlayer } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { getEvaluationCategories, postEvaluationEntry } from "@/api/evaluation";
import type { CoachPlayer, CoachLevel, PlayerProfile, EvaluationCategory, CoachNote } from "@/types";
import { EditPlayerSheet, type EditPlayerInput } from "@/components/players/EditPlayerSheet";
import { AddEvaluationSheet } from "@/components/players/detail/AddEvaluationSheet";
import { PlayerHeader } from "@/components/players/detail/PlayerHeader";
import { PlayerEvaluations } from "@/components/players/detail/PlayerEvaluations";
import { PlayerStrengthsWeaknesses } from "@/components/players/detail/PlayerStrengthsWeaknesses";
import { PlayerInfoCard } from "@/components/players/detail/PlayerInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardPlus, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToClassesDialog } from "@/components/players/detail/AddToClassesDialog";
import { toast } from "sonner";

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
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [isClassesOpen, setIsClassesOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [playersData, levelsData] = await Promise.all([
          getCoachPlayers(),
          getCoachLevels(),
        ]);
        setLevels(levelsData);

        const found = playersData.find((p) => String(p.playerId) === String(playerId));
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

  const handleOpenEval = async () => {
    if (categories.length === 0) {
      setCategoriesLoading(true);
      try {
        const cats = await getEvaluationCategories();
        setCategories(cats);
      } finally {
        setCategoriesLoading(false);
      }
    }
    setIsEvalOpen(true);
  };

  const handleEvalSave = async (data: {
    scores: { categoryId: string; value: number }[];
    strengths: CoachNote[];
    weaknesses: CoachNote[];
  }) => {
    if (!player) return;

    // Optimistic update
    const newEvaluations = data.scores.map((s) => {
      const cat = categories.find((c) => c.id === s.categoryId);
      return {
        categoryId: Number(s.categoryId),
        categoryName: cat?.name ?? String(s.categoryId),
        score: s.value,
        scaleMin: cat?.scaleMin ?? 0,
        scaleMax: cat?.scaleMax ?? 10,
        evaluatedAt: new Date().toISOString(),
      };
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
          <Button size="sm" disabled={categoriesLoading} onClick={handleOpenEval}>
            <ClipboardPlus className="mr-2 h-4 w-4" /> {categoriesLoading ? "Loading..." : "Add Evaluation"}
          </Button>
        </div>

        <PlayerHeader player={player} levels={levels} onEdit={() => setIsEditOpen(true)} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PlayerEvaluations evaluations={profile?.evaluations ?? []} />
            <PlayerStrengthsWeaknesses
              strengths={profile?.strengths ?? []}
              weaknesses={profile?.weaknesses ?? []}
              playerId={player.playerId}
              onAddStrength={async (text) => {
                const note: CoachNote = { id: -Date.now(), text };
                setProfile((prev) => prev ? { ...prev, strengths: [...prev.strengths, note] } : prev);
                await addCoachNote(player.playerId, "strength", text);
              }}
              onRemoveStrength={async (_i, note) => {
                setProfile((prev) => prev ? { ...prev, strengths: prev.strengths.filter((s) => s !== note) } : prev);
                await deleteCoachNote(note);
              }}
              onAddWeakness={async (text) => {
                const note: CoachNote = { id: -Date.now(), text };
                setProfile((prev) => prev ? { ...prev, weaknesses: [...prev.weaknesses, note] } : prev);
                await addCoachNote(player.playerId, "weakness", text);
              }}
              onRemoveWeakness={async (_i, note) => {
                setProfile((prev) => prev ? { ...prev, weaknesses: prev.weaknesses.filter((w) => w !== note) } : prev);
                await deleteCoachNote(note);
              }}
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
