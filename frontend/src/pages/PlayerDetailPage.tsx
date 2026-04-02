import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCoachPlayers, getPlayerProfile, addCoachNote, deleteCoachNote, editPlayer } from "@/api/players";
import { getCoachLevels } from "@/api/coachLevel";
import { getEvaluationCategories, postEvaluationEntry } from "@/api/evaluation";
import type { CoachPlayer, CoachLevel, PlayerProfile, EvaluationCategory, CoachNote, PlayerSide } from "@/types";
import { AddEvaluationSheet } from "@/components/players/detail/AddEvaluationSheet";
import { PlayerHeader } from "@/components/players/detail/PlayerHeader";
import { PlayerEvaluations } from "@/components/players/detail/PlayerEvaluations";
import { PlayerStrengthsWeaknesses } from "@/components/players/detail/PlayerStrengthsWeaknesses";
import { PlayerInfoCard } from "@/components/players/detail/PlayerInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardPlus, CalendarPlus, ListX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToClassesDialog } from "@/components/players/detail/AddToClassesDialog";
import { AddToStandingWaitingListDialog } from "@/components/players/AddToStandingWaitingListDialog";
import { getStandingWaitingList, removeFromStandingWaitingList } from "@/api/notificationEngine";
import type { StandingWaitingListEntry } from "@/types";
import { toast } from "sonner";

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  const [player, setPlayer] = useState<CoachPlayer | null>(null);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [categories, setCategories] = useState<EvaluationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEvalOpen, setIsEvalOpen] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [isClassesOpen, setIsClassesOpen] = useState(false);

  // Inline edit state
  const [standingEntry, setStandingEntry] = useState<StandingWaitingListEntry | null>(null);
  const [isWaitingListOpen, setIsWaitingListOpen] = useState(false);
  const [removingWaitingList, setRemovingWaitingList] = useState(false);

  // Inline edit state
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftLevelId, setDraftLevelId] = useState("");
  const [draftSide, setDraftSide] = useState<PlayerSide | "">("");
  const [draftNotes, setDraftNotes] = useState("");

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
          const [profileData, standingList] = await Promise.all([
            getPlayerProfile(found.playerId),
            getStandingWaitingList(),
          ]);
          setProfile(profileData);
          const entry = standingList.find((e) => String(e.playerId) === String(found.playerId));
          setStandingEntry(entry ?? null);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  const handleEditStart = () => {
    if (!player) return;
    setDraftName(player.name ?? "");
    setDraftUsername(player.username ?? "");
    setDraftEmail(player.email ?? "");
    setDraftPhone(player.phone ?? "");
    setDraftLevelId(player.levelId ?? "");
    setDraftSide(player.side ?? "");
    setDraftNotes(player.notes ?? "");
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  const handleEditSave = async () => {
    if (!player) return;
    const level = draftLevelId ? levels.find((l) => l.id === draftLevelId) : undefined;

    const updates = {
      name: draftName.trim() || undefined,
      username: draftUsername.trim() || undefined,
      userId: player.userId,
      email: draftEmail.trim() || undefined,
      phone: draftPhone.trim() || undefined,
      levelId: draftLevelId || undefined,
      side: (draftSide || undefined) as PlayerSide | undefined,
      notes: draftNotes.trim() || undefined,
    };

    setSavingPlayer(true);

    try {
      await editPlayer(player, updates);

      const updated: CoachPlayer = {
        ...player,
        name: updates.name ?? player.name,
        username: updates.username,
        email: updates.email,
        phone: updates.phone,
        levelId: updates.levelId,
        side: updates.side,
        notes: updates.notes,
        level,
      };

      setPlayer(updated);
      setIsEditing(false);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingPlayer(false);
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

    try {
      await postEvaluationEntry({
        playerId: player.playerId,
        scores: data.scores,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
      });

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
    } catch {
      toast.error("Failed to save evaluation");
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
          <Button size="sm" variant="outline" onClick={() => setIsClassesOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Add to Classes
          </Button>
          {standingEntry ? (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
              disabled={removingWaitingList}
              onClick={async () => {
                setRemovingWaitingList(true);
                try {
                  await removeFromStandingWaitingList(standingEntry.id);
                  setStandingEntry(null);
                  toast.success(`Removed ${player.name} from the waiting list`);
                } catch {
                  toast.error("Failed to remove from waiting list");
                } finally {
                  setRemovingWaitingList(false);
                }
              }}
            >
              {removingWaitingList ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListX className="mr-2 h-4 w-4" />}
              On waiting list
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsWaitingListOpen(true)}>
              <ListX className="mr-2 h-4 w-4" /> Waiting list
            </Button>
          )}
          <Button size="sm" disabled={categoriesLoading} onClick={handleOpenEval}>
            <ClipboardPlus className="mr-2 h-4 w-4" /> {categoriesLoading ? "Loading..." : "Add Evaluation"}
          </Button>
        </div>

        <PlayerHeader
          player={player}
          levels={levels}
          isEditing={isEditing}
          saving={savingPlayer}
          draftName={draftName}
          draftLevelId={draftLevelId}
          draftSide={draftSide}
          onDraftNameChange={setDraftName}
          onDraftLevelIdChange={setDraftLevelId}
          onDraftSideChange={setDraftSide}
          onEdit={handleEditStart}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PlayerEvaluations evaluations={profile?.evaluations ?? []} />
            <PlayerStrengthsWeaknesses
              strengths={profile?.strengths ?? []}
              weaknesses={profile?.weaknesses ?? []}
              playerId={player.playerId}
              onAddStrength={async (text) => {
                try {
                  await addCoachNote(player.playerId, "strength", text);
                  const note: CoachNote = { id: -Date.now(), text };
                  setProfile((prev) => prev ? { ...prev, strengths: [...prev.strengths, note] } : prev);
                } catch {
                  toast.error("Failed to add strength");
                }
              }}
              onRemoveStrength={async (_i, note) => {
                try {
                  await deleteCoachNote(note);
                  setProfile((prev) => prev ? { ...prev, strengths: prev.strengths.filter((s) => s !== note) } : prev);
                } catch {
                  toast.error("Failed to remove strength");
                }
              }}
              onAddWeakness={async (text) => {
                try {
                  await addCoachNote(player.playerId, "weakness", text);
                  const note: CoachNote = { id: -Date.now(), text };
                  setProfile((prev) => prev ? { ...prev, weaknesses: [...prev.weaknesses, note] } : prev);
                } catch {
                  toast.error("Failed to add weakness");
                }
              }}
              onRemoveWeakness={async (_i, note) => {
                try {
                  await deleteCoachNote(note);
                  setProfile((prev) => prev ? { ...prev, weaknesses: prev.weaknesses.filter((w) => w !== note) } : prev);
                } catch {
                  toast.error("Failed to remove weakness");
                }
              }}
            />
          </div>
          <div>
            <PlayerInfoCard
              player={player}
              isEditing={isEditing}
              draftUsername={draftUsername}
              draftEmail={draftEmail}
              draftPhone={draftPhone}
              draftNotes={draftNotes}
              onDraftUsernameChange={setDraftUsername}
              onDraftEmailChange={setDraftEmail}
              onDraftPhoneChange={setDraftPhone}
              onDraftNotesChange={setDraftNotes}
            />
          </div>
        </div>

        <AddEvaluationSheet
          open={isEvalOpen}
          onClose={() => setIsEvalOpen(false)}
          onSave={handleEvalSave}
          categories={categories}
          currentEvaluations={profile?.evaluations ?? []}
          currentStrengths={profile?.strengths ?? []}
          currentWeaknesses={profile?.weaknesses ?? []}
        />

        <AddToClassesDialog
          open={isClassesOpen}
          onClose={() => setIsClassesOpen(false)}
          player={player}
          onSave={(classIds) => {
            toast.success(`Added ${player.name} to ${classIds.length} ${classIds.length === 1 ? "class" : "classes"}`);
          }}
        />

        <AddToStandingWaitingListDialog
          open={isWaitingListOpen}
          onClose={() => setIsWaitingListOpen(false)}
          playerId={Number(player.playerId)}
          playerName={player.name ?? null}
          onAdded={(entry) => {
            setStandingEntry(entry);
            toast.success(`${player.name} added to the waiting list`);
          }}
        />
      </div>
    </AppLayout>
  );
}
