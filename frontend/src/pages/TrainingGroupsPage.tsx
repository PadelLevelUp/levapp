import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExerciseFormSheet } from "@/components/training/ExerciseFormSheet";
import { ExerciseGroupFormSheet } from "@/components/training/ExerciseGroupFormSheet";
import { ExerciseGroupFolder } from "@/components/training/ExerciseGroupFolder";
import {
  getExercises, createExercise, updateExercise, deleteExercise,
  getExerciseGroups, createExerciseGroup, updateExerciseGroup, deleteExerciseGroup,
} from "@/api/training";
import type { Exercise, ExercisePayload, ExerciseGroup, ExerciseGroupPayload } from "@/types/training";
import { Plus, Search, FolderOpen, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function TrainingGroupsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExerciseGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // For editing exercises within a group
  const [exerciseSheetOpen, setExerciseSheetOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const { data: exercises = [] } = useQuery({ queryKey: ["exercises"], queryFn: getExercises });
  const { data: groups = [], isLoading } = useQuery({ queryKey: ["exercise-groups"], queryFn: getExerciseGroups });

  // Group mutations
  const createGrpMut = useMutation({
    mutationFn: createExerciseGroup,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setGroupSheetOpen(false); toast.success(t("training.groups.toast.created")); },
    onError: () => toast.error(t("training.groups.toast.createFailed")),
  });
  const updateGrpMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExerciseGroupPayload }) => updateExerciseGroup(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setGroupSheetOpen(false); setEditingGroup(null); toast.success(t("training.groups.toast.updated")); },
    onError: () => toast.error(t("training.groups.toast.updateFailed")),
  });
  const deleteGrpMut = useMutation({
    mutationFn: deleteExerciseGroup,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setDeletingGroupId(null); toast.success(t("training.groups.toast.deleted")); },
    onError: () => toast.error(t("training.groups.toast.deleteFailed")),
  });

  // Exercise mutations (for inline editing)
  const updateExMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExercisePayload }) => updateExercise(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setExerciseSheetOpen(false); setEditingExercise(null); toast.success(t("training.exercises.toast.updated")); },
    onError: () => toast.error(t("training.exercises.toast.updateFailed")),
  });
  const deleteExMut = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setDeletingExerciseId(null); toast.success(t("training.exercises.toast.deleted")); },
    onError: () => toast.error(t("training.exercises.toast.deleteFailed")),
  });

  function handleGroupSubmit(data: ExerciseGroupPayload) {
    if (editingGroup) updateGrpMut.mutate({ id: editingGroup.id, data });
    else createGrpMut.mutate(data);
  }

  function handleExerciseSubmit(data: ExercisePayload) {
    if (editingExercise) updateExMut.mutate({ id: editingExercise.id, data });
  }

  const filtered = groups.filter((g) => {
    if (!search) return true;
    if (g.name.toLowerCase().includes(search.toLowerCase())) return true;
    return g.exerciseIds.some((id) => {
      const ex = exercises.find((e) => e.id === id);
      return ex && ex.name.toLowerCase().includes(search.toLowerCase());
    });
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/training")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{t("training.groups.title")}</h1>
              <p className="text-muted-foreground text-sm">{t("training.groups.subtitle")}</p>
            </div>
          </div>
          <Button onClick={() => { setEditingGroup(null); setGroupSheetOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {t("training.groups.newGroup")}
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("training.groups.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">{t("training.groups.emptyTitle")}</p>
            <p className="text-sm mt-1">{t("training.groups.emptyDescription")}</p>
            <Button className="mt-4" onClick={() => { setEditingGroup(null); setGroupSheetOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> {t("training.groups.newGroup")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">{t("training.groups.noResultsTitle")}</p>
            <p className="text-sm mt-1">{t("training.groups.noResultsDescription")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => (
              <ExerciseGroupFolder
                key={g.id}
                group={g}
                exercises={exercises}
                onEditGroup={() => { setEditingGroup(g); setGroupSheetOpen(true); }}
                onDeleteGroup={() => setDeletingGroupId(g.id)}
                onEditExercise={(ex) => { setEditingExercise(ex); setExerciseSheetOpen(true); }}
                onDeleteExercise={(id) => setDeletingExerciseId(id)}
              />
            ))}
          </div>
        )}
      </div>

      <ExerciseGroupFormSheet
        open={groupSheetOpen}
        onOpenChange={(o) => { setGroupSheetOpen(o); if (!o) setEditingGroup(null); }}
        group={editingGroup}
        exercises={exercises}
        onSubmit={handleGroupSubmit}
        loading={createGrpMut.isPending || updateGrpMut.isPending}
      />

      <ExerciseFormSheet
        open={exerciseSheetOpen}
        onOpenChange={(o) => { setExerciseSheetOpen(o); if (!o) setEditingExercise(null); }}
        exercise={editingExercise}
        onSubmit={handleExerciseSubmit}
        loading={updateExMut.isPending}
      />

      <AlertDialog open={!!deletingGroupId} onOpenChange={(o) => !o && setDeletingGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("training.groups.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("training.groups.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingGroupId && deleteGrpMut.mutate(deletingGroupId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingExerciseId} onOpenChange={(o) => !o && setDeletingExerciseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("training.exercises.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("training.exercises.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingExerciseId && deleteExMut.mutate(deletingExerciseId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
