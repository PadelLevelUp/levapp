import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExerciseFormSheet } from "@/components/training/ExerciseFormSheet";
import { ExerciseCard } from "@/components/training/ExerciseCard";
import { getExercises, createExercise, updateExercise, deleteExercise } from "@/api/training";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { Exercise, ExercisePayload } from "@/types/training";
import { Plus, Search, Dumbbell, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function TrainingExercisesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: getExercises,
  });

  const createMut = useMutation({
    mutationFn: createExercise,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setSheetOpen(false); toast.success("Exercise created"); },
    onError: () => toast.error("Failed to create exercise"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExercisePayload }) => updateExercise(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setSheetOpen(false); setEditing(null); toast.success("Exercise updated"); },
    onError: () => toast.error("Failed to update exercise"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exercises"] }); setDeletingId(null); toast.success("Exercise deleted"); },
    onError: () => toast.error("Failed to delete exercise"),
  });

  function handleSubmit(data: ExercisePayload) {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  }

  const filtered = exercises.filter((ex) => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && ex.type !== filterType) return false;
    if (filterDifficulty !== "all" && ex.difficulty !== Number(filterDifficulty)) return false;
    return true;
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
              <h1 className="text-2xl font-bold">Exercises</h1>
              <p className="text-muted-foreground text-sm">Browse and manage individual exercises</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Exercise
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search exercises..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No exercises yet</p>
            <p className="text-sm mt-1">Create your first exercise to get started</p>
            <Button className="mt-4" onClick={() => { setEditing(null); setSheetOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Exercise
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No results</p>
            <p className="text-sm mt-1">Try different filters</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onClick={() => { setEditing(ex); setSheetOpen(true); }}
                onDelete={() => setDeletingId(ex.id)}
              />
            ))}
          </div>
        )}
      </div>

      <ExerciseFormSheet
        open={sheetOpen}
        onOpenChange={(o) => { setSheetOpen(o); if (!o) setEditing(null); }}
        exercise={editing}
        onSubmit={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
