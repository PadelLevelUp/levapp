import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExerciseFormSheet } from "@/components/training/ExerciseFormSheet";
import { ExerciseGroupFormSheet } from "@/components/training/ExerciseGroupFormSheet";
import { ExerciseCard } from "@/components/training/ExerciseCard";
import { ExerciseGroupFolder } from "@/components/training/ExerciseGroupFolder";
import {
  getExercises, createExercise, updateExercise, deleteExercise,
  getExerciseGroups, createExerciseGroup, updateExerciseGroup, deleteExerciseGroup,
} from "@/api/training";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { Exercise, ExercisePayload, ExerciseType, ExerciseGroup, ExerciseGroupPayload } from "@/types/training";
import { Plus, Search, Dumbbell, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TrainingPage() {
  const queryClient = useQueryClient();

  // Exercise sheet
  const [exerciseSheetOpen, setExerciseSheetOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Group sheet
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExerciseGroup | null>(null);

  // Delete dialogs
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");

  const { data: exercises = [], isLoading: loadingEx } = useQuery({
    queryKey: ["exercises"],
    queryFn: getExercises,
  });

  const { data: groups = [], isLoading: loadingGrp } = useQuery({
    queryKey: ["exercise-groups"],
    queryFn: getExerciseGroups,
  });

  const isLoading = loadingEx || loadingGrp;

  // ── Exercise mutations ──
  const createExMut = useMutation({
    mutationFn: createExercise,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setExerciseSheetOpen(false); toast.success("Exercise created"); },
    onError: () => toast.error("Failed to create exercise"),
  });

  const updateExMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExercisePayload }) => updateExercise(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setExerciseSheetOpen(false); setEditingExercise(null); toast.success("Exercise updated"); },
    onError: () => toast.error("Failed to update exercise"),
  });

  const deleteExMut = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setDeletingExerciseId(null); toast.success("Exercise deleted"); },
    onError: () => toast.error("Failed to delete exercise"),
  });

  // ── Group mutations ──
  const createGrpMut = useMutation({
    mutationFn: createExerciseGroup,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setGroupSheetOpen(false); toast.success("Group created"); },
    onError: () => toast.error("Failed to create group"),
  });

  const updateGrpMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExerciseGroupPayload }) => updateExerciseGroup(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setGroupSheetOpen(false); setEditingGroup(null); toast.success("Group updated"); },
    onError: () => toast.error("Failed to update group"),
  });

  const deleteGrpMut = useMutation({
    mutationFn: deleteExerciseGroup,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercise-groups"] }); setDeletingGroupId(null); toast.success("Group deleted"); },
    onError: () => toast.error("Failed to delete group"),
  });

  // ── Handlers ──
  function handleExerciseSubmit(data: ExercisePayload) {
    if (editingExercise) updateExMut.mutate({ id: editingExercise.id, data });
    else createExMut.mutate(data);
  }

  function handleGroupSubmit(data: ExerciseGroupPayload) {
    if (editingGroup) updateGrpMut.mutate({ id: editingGroup.id, data });
    else createGrpMut.mutate(data);
  }

  function openCreateExercise() { setEditingExercise(null); setExerciseSheetOpen(true); }
  function openEditExercise(ex: Exercise) { setEditingExercise(ex); setExerciseSheetOpen(true); }
  function openCreateGroup() { setEditingGroup(null); setGroupSheetOpen(true); }
  function openEditGroup(g: ExerciseGroup) { setEditingGroup(g); setGroupSheetOpen(true); }

  // ── Filtering ──
  const groupedExerciseIds = new Set(groups.flatMap((g) => g.exerciseIds));

  const ungroupedExercises = exercises.filter((ex) => !groupedExerciseIds.has(ex.id));

  const filteredUngrouped = ungroupedExercises.filter((ex) => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && ex.type !== filterType) return false;
    if (filterDifficulty !== "all" && ex.difficulty !== Number(filterDifficulty)) return false;
    return true;
  });

  const filteredGroups = groups.filter((g) => {
    if (!search) return true;
    // Show group if name matches or any exercise in it matches
    if (g.name.toLowerCase().includes(search.toLowerCase())) return true;
    return g.exerciseIds.some((id) => {
      const ex = exercises.find((e) => e.id === id);
      return ex && ex.name.toLowerCase().includes(search.toLowerCase());
    });
  });

  const isEmpty = exercises.length === 0 && groups.length === 0;
  const noResults = !isEmpty && filteredGroups.length === 0 && filteredUngrouped.length === 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Training</h1>
            <p className="text-muted-foreground text-sm">Manage exercises and training groups</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openCreateExercise}>
                <Dumbbell className="w-4 h-4 mr-2" />
                New Exercise
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openCreateGroup}>
                <FolderPlus className="w-4 h-4 mr-2" />
                New Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search exercises or groups..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {EXERCISE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All difficulties</SelectItem>
              {DIFFICULTY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No exercises yet</p>
            <p className="text-sm mt-1">Create your first exercise or group to get started</p>
            <div className="flex gap-2 mt-4">
              <Button onClick={openCreateExercise}>
                <Plus className="w-4 h-4 mr-2" />
                New Exercise
              </Button>
              <Button variant="outline" onClick={openCreateGroup}>
                <FolderPlus className="w-4 h-4 mr-2" />
                New Group
              </Button>
            </div>
          </div>
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No results</p>
            <p className="text-sm mt-1">Try different filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Groups as folders */}
            {filteredGroups.length > 0 && (
              <div className="space-y-2">
                {filteredGroups.map((g) => (
                  <ExerciseGroupFolder
                    key={g.id}
                    group={g}
                    exercises={exercises}
                    onEditGroup={() => openEditGroup(g)}
                    onDeleteGroup={() => setDeletingGroupId(g.id)}
                    onEditExercise={openEditExercise}
                    onDeleteExercise={(id) => setDeletingExerciseId(id)}
                  />
                ))}
              </div>
            )}

            {/* Ungrouped exercises */}
            {filteredUngrouped.length > 0 && (
              <div className="space-y-2">
                {filteredGroups.length > 0 && (
                  <h2 className="text-sm font-medium text-muted-foreground">Ungrouped exercises</h2>
                )}
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filteredUngrouped.map((ex) => (
                    <ExerciseCard
                      key={ex.id}
                      exercise={ex}
                      onClick={() => openEditExercise(ex)}
                      onDelete={() => setDeletingExerciseId(ex.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sheets */}
      <ExerciseFormSheet
        open={exerciseSheetOpen}
        onOpenChange={(o) => { setExerciseSheetOpen(o); if (!o) setEditingExercise(null); }}
        exercise={editingExercise}
        onSubmit={handleExerciseSubmit}
        loading={createExMut.isPending || updateExMut.isPending}
      />

      <ExerciseGroupFormSheet
        open={groupSheetOpen}
        onOpenChange={(o) => { setGroupSheetOpen(o); if (!o) setEditingGroup(null); }}
        group={editingGroup}
        exercises={exercises}
        onSubmit={handleGroupSubmit}
        loading={createGrpMut.isPending || updateGrpMut.isPending}
      />

      {/* Delete exercise dialog */}
      <AlertDialog open={!!deletingExerciseId} onOpenChange={(o) => !o && setDeletingExerciseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingExerciseId && deleteExMut.mutate(deletingExerciseId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete group dialog */}
      <AlertDialog open={!!deletingGroupId} onOpenChange={(o) => !o && setDeletingGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the group but keep the exercises.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingGroupId && deleteGrpMut.mutate(deletingGroupId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
