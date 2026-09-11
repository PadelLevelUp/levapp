import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCoachPlayers, getPlayerProfile, addCoachNote, deleteCoachNote, editPlayer, removePlayer, getPlayerRemovalImpact, removePlayerErrorCode } from "@/api/players";
import type { PlayerRemovalImpact } from "@levelup/types";
import { getCoachLevels } from "@/api/coachLevel";
import { getEvaluationCategories, postEvaluationEntry } from "@/api/evaluation";
import type { CoachPlayer, CoachLevel, PlayerProfile, EvaluationCategory, CoachNote, PlayerSide } from "@/types";
import { AddEvaluationSheet } from "@/components/players/detail/AddEvaluationSheet";
import { PlayerHeader } from "@/components/players/detail/PlayerHeader";
import { PlayerEvaluations } from "@/components/players/detail/PlayerEvaluations";
import { PlayerStrengthsWeaknesses } from "@/components/players/detail/PlayerStrengthsWeaknesses";
import { PlayerInfoCard } from "@/components/players/detail/PlayerInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CalendarCheck, CalendarX, ClipboardPlus, CalendarPlus, ListX, Loader2, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageActions } from "@/components/layout/PageActions";
import type { PageAction } from "@/components/layout/PageActions";
import { AddToClassesDialog } from "@/components/players/detail/AddToClassesDialog";
import { AddToStandingWaitingListDialog } from "@/components/players/AddToStandingWaitingListDialog";
import { getStandingWaitingList, removeFromStandingWaitingList } from "@/api/notificationEngine";
import type { StandingWaitingListEntry } from "@/types";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { t } = useTranslation();

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
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftLevelId, setDraftLevelId] = useState("");
  const [draftSide, setDraftSide] = useState<PlayerSide | "">("");
  const [draftNotes, setDraftNotes] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // players.remove rule 7 (PAD-274): the confirmation shows what the removal takes.
  const [removalImpact, setRemovalImpact] = useState<PlayerRemovalImpact | null>(null);
  const [removalImpactFailed, setRemovalImpactFailed] = useState(false);

  // players.remove rules 4-5: the roster's `deletable` says whether this coach may
  // delete the record (a placeholder); otherwise they can only disconnect.
  const canDelete = player?.deletable === true;
  const removalAction = removalImpact?.action ?? (canDelete ? "delete" : "disconnect");

  const openRemove = () => {
    if (!player) return;
    setRemovalImpact(null);
    setRemovalImpactFailed(false);
    setIsDeleteOpen(true);
    getPlayerRemovalImpact(String(player.playerId))
      .then(setRemovalImpact)
      .catch(() => setRemovalImpactFailed(true));
  };

  const handleDelete = async () => {
    if (!player || !authUser?.coachId) return;
    const name = player.name || t("players.defaultPlayerName");
    setDeleting(true);
    try {
      await removePlayer(authUser.coachId, player.playerId, removalAction);
      toast.success(removalAction === "delete" ? t("players.deleted", { name }) : t("players.disconnected", { name }));
      navigate("/players");
    } catch (err) {
      const code = removePlayerErrorCode(err);
      toast.error(
        code === "PLAYER_HAS_ACCOUNT"
          ? t("players.removeRefusedHasAccount", { name })
          : code === "PLAYER_HAS_OTHER_COACHES"
            ? t("players.removeRefusedOtherCoaches", { name })
            : removalAction === "delete"
              ? t("players.deleteFailed")
              : t("players.disconnectFailed"),
      );
    } finally {
      setDeleting(false);
      setIsDeleteOpen(false);
    }
  };

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
      toast.error(t("players.saveChangesFailed"));
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

      // Refetch the persisted profile so the Evaluation panel reflects the true
      // server state (and survives a hard reload) rather than a hand-built
      // optimistic guess.
      const refreshed = await getPlayerProfile(player.playerId);
      if (refreshed) {
        setProfile(refreshed);
      }
    } catch (err) {
      toast.error(t("players.saveEvaluationFailed"));
      // Re-throw so the awaiting sheet knows the save failed and can stay open
      // instead of flashing a false-success toast and closing.
      throw err;
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
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("players.backToPlayers")}
          </Button>
          <p className="text-muted-foreground">{t("players.notFound")}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/players")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("players.backToPlayers")}
          </Button>
          <PageActions
            actions={[
              // PAD-114: the coach-side entry point into the shared "Presenças"
              // page. The student reaches the same page from their dashboard's
              // "Attended" KPI; both land on one component backed by one
              // server-authorized endpoint.
              {
                label: t("attendance.playerLink"),
                icon: <CalendarCheck className="mr-2 h-4 w-4" />,
                onClick: () => navigate(`/players/${playerId}/attendance`),
                testId: "player-attendance-link",
              },
              // PAD-141: the same entry point for "Faltas". Kept immediately
              // beside its counterpart so the pair reads as one idea.
              // `PageActions` already wraps (PAD-114 widened it after a 5th
              // action pushed "Delete Player" off a 1280px viewport), so this
              // 6th action does not reintroduce that overflow.
              {
                label: t("absences.playerLink"),
                icon: <CalendarX className="mr-2 h-4 w-4" />,
                onClick: () => navigate(`/players/${playerId}/absences`),
                testId: "player-absences-link",
              },
              {
                label: t("players.addToClasses"),
                icon: <CalendarPlus className="mr-2 h-4 w-4" />,
                onClick: () => setIsClassesOpen(true),
              },
              standingEntry
                ? {
                    label: t("players.onWaitingList"),
                    icon: removingWaitingList
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <ListX className="mr-2 h-4 w-4" />,
                    onClick: async () => {
                      setRemovingWaitingList(true);
                      try {
                        await removeFromStandingWaitingList(standingEntry.id);
                        setStandingEntry(null);
                        toast.success(t("players.removedFromWaitingList", { name: player.name }));
                      } catch {
                        toast.error(t("players.removeFromWaitingListFailed"));
                      } finally {
                        setRemovingWaitingList(false);
                      }
                    },
                    disabled: removingWaitingList,
                    className: "text-warning border-warning/40 hover:bg-warning/10",
                  }
                : {
                    label: t("players.waitingList"),
                    icon: <ListX className="mr-2 h-4 w-4" />,
                    onClick: () => setIsWaitingListOpen(true),
                  },
              {
                label: categoriesLoading ? t("players.loading") : t("players.addEvaluation"),
                icon: <ClipboardPlus className="mr-2 h-4 w-4" />,
                onClick: handleOpenEval,
                disabled: categoriesLoading,
                variant: "default" as const,
              },
              {
                label: canDelete ? t("players.deletePlayer") : t("players.disconnectPlayer"),
                icon: canDelete ? <Trash2 className="mr-2 h-4 w-4" /> : <Unlink className="mr-2 h-4 w-4" />,
                onClick: openRemove,
                variant: "destructive" as const,
              },
            ] satisfies PageAction[]}
          />
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
                  // Use the server-returned note (real numeric id) so deleting it
                  // before a reload targets the persisted row, not a temp id (PAD-101).
                  const note = await addCoachNote(player.playerId, "strength", text);
                  setProfile((prev) => prev ? { ...prev, strengths: [...prev.strengths, note] } : prev);
                } catch {
                  toast.error(t("players.addStrengthFailed"));
                }
              }}
              onRemoveStrength={async (_i, note) => {
                try {
                  await deleteCoachNote(note);
                  setProfile((prev) => prev ? { ...prev, strengths: prev.strengths.filter((s) => s !== note) } : prev);
                } catch {
                  toast.error(t("players.removeStrengthFailed"));
                }
              }}
              onAddWeakness={async (text) => {
                try {
                  const note = await addCoachNote(player.playerId, "weakness", text);
                  setProfile((prev) => prev ? { ...prev, weaknesses: [...prev.weaknesses, note] } : prev);
                } catch {
                  toast.error(t("players.addWeaknessFailed"));
                }
              }}
              onRemoveWeakness={async (_i, note) => {
                try {
                  await deleteCoachNote(note);
                  setProfile((prev) => prev ? { ...prev, weaknesses: prev.weaknesses.filter((w) => w !== note) } : prev);
                } catch {
                  toast.error(t("players.removeWeaknessFailed"));
                }
              }}
            />
          </div>
          <div>
            <PlayerInfoCard
              player={player}
              isEditing={isEditing}
              draftEmail={draftEmail}
              draftPhone={draftPhone}
              draftNotes={draftNotes}
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
        />

        <AddToStandingWaitingListDialog
          open={isWaitingListOpen}
          onClose={() => setIsWaitingListOpen(false)}
          playerId={Number(player.playerId)}
          playerName={player.name ?? null}
          onAdded={(entry) => {
            setStandingEntry(entry);
            toast.success(t("players.addedToWaitingList", { name: player.name }));
          }}
        />

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("players.deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {removalAction === "delete"
                  ? t("players.deletePlaceholderConfirmDescription", { name: player.name || t("players.deleteConfirmDefaultName") })
                  : t("players.disconnectConfirmDescription", { name: player.name || t("players.deleteConfirmDefaultName") })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div data-testid="player-removal-impact" className="text-sm text-muted-foreground">
              {removalImpact ? (
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("players.removalImpactNotes", { count: removalImpact.notes })}</li>
                  <li>{t("players.removalImpactEvaluations", { count: removalImpact.evaluations })}</li>
                  {removalImpact.presences !== undefined ? (
                    <li>{t("players.removalImpactPresences", { count: removalImpact.presences })}</li>
                  ) : null}
                </ul>
              ) : removalImpactFailed ? null : (
                <p>{t("players.removalImpactLoading")}</p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                data-testid="player-remove-confirm"
                onClick={handleDelete}
                disabled={deleting || (removalImpact === null && !removalImpactFailed)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {removalAction === "delete"
                  ? deleting ? t("players.deleting") : t("common.delete")
                  : deleting ? t("players.disconnecting") : t("players.disconnect")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
