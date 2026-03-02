import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExerciseFormSheet } from "@/components/training/ExerciseFormSheet";
import { getExercises, createExercise, updateExercise, deleteExercise } from "@/api/training";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { Exercise, ExercisePayload, ExerciseType } from "@/types/training";
import { Plus, Search, Dumbbell, Trash2 } from "lucide-react";
import { toast } from "sonner";
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

export default function TrainingPage() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: getExercises,
  });

  const createMut = useMutation({
    mutationFn: createExercise,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      setSheetOpen(false);
      toast.success("Ejercicio creado");
    },
    onError: () => toast.error("Error al crear ejercicio"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExercisePayload }) => updateExercise(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      setSheetOpen(false);
      setEditingExercise(null);
      toast.success("Ejercicio actualizado");
    },
    onError: () => toast.error("Error al actualizar ejercicio"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      setDeletingId(null);
      toast.success("Ejercicio eliminado");
    },
    onError: () => toast.error("Error al eliminar ejercicio"),
  });

  function handleSubmit(data: ExercisePayload) {
    if (editingExercise) {
      updateMut.mutate({ id: editingExercise.id, data });
    } else {
      createMut.mutate(data);
    }
  }

  function openCreate() {
    setEditingExercise(null);
    setSheetOpen(true);
  }

  function openEdit(ex: Exercise) {
    setEditingExercise(ex);
    setSheetOpen(true);
  }

  // Filter exercises
  const filtered = exercises.filter((ex) => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && ex.type !== filterType) return false;
    if (filterDifficulty !== "all" && ex.difficulty !== Number(filterDifficulty)) return false;
    return true;
  });

  const typeLabel = (t: ExerciseType) =>
    EXERCISE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  const diffLabel = (d: number) =>
    DIFFICULTY_OPTIONS.find((o) => o.value === d)?.label ?? String(d);

  const diffColor = (d: number) => {
    if (d <= 2) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (d <= 3) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-red-500/15 text-red-700 border-red-500/30";
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Entrenamientos</h1>
            <p className="text-muted-foreground text-sm">Gestiona ejercicios y rutinas de entrenamiento</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo ejercicio
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ejercicios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {EXERCISE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Dificultad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda dificultad</SelectItem>
              {DIFFICULTY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Exercise grid */}
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-32" />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {exercises.length === 0 ? "No hay ejercicios aún" : "Sin resultados"}
            </p>
            <p className="text-sm mt-1">
              {exercises.length === 0
                ? "Crea tu primer ejercicio para empezar"
                : "Prueba con otros filtros"}
            </p>
            {exercises.length === 0 && (
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Crear ejercicio
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ex) => (
              <Card
                key={ex.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => openEdit(ex)}
              >
                <CardContent className="p-4 space-y-2">
                  {/* Thumbnail preview of diagram */}
                  {ex.diagram && ex.diagram.elements.length > 0 && (
                    <div className="h-24 bg-emerald-900/80 rounded overflow-hidden mb-2">
                      <svg viewBox="0 0 240 440" className="w-full h-full">
                        <rect x="20" y="20" width="200" height="400" fill="#2d6a3f" stroke="white" strokeWidth="2" rx="2" />
                        <line x1="20" y1="220" x2="220" y2="220" stroke="white" strokeWidth="2" />
                        {ex.diagram.elements.slice(0, 15).map((el) => {
                          if (el.type === "player_a") return <circle key={el.id} cx={el.x} cy={el.y} r="8" fill="#3b82f6" />;
                          if (el.type === "player_b") return <circle key={el.id} cx={el.x} cy={el.y} r="8" fill="#ef4444" />;
                          if (el.type === "cone") return <polygon key={el.id} points={`${el.x},${el.y - 6} ${el.x - 5},${el.y + 4} ${el.x + 5},${el.y + 4}`} fill="#f97316" />;
                          if (el.type === "ball") return <circle key={el.id} cx={el.x} cy={el.y} r="4" fill="#facc15" />;
                          if ((el.type === "arrow" || el.type === "movement") && el.endX != null) {
                            return <line key={el.id} x1={el.x} y1={el.y} x2={el.endX} y2={el.endY} stroke="white" strokeWidth="1.5" opacity="0.7" />;
                          }
                          return null;
                        })}
                      </svg>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight">{ex.name}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(ex.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {ex.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{ex.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{typeLabel(ex.type)}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${diffColor(ex.difficulty)}`}>
                      {diffLabel(ex.difficulty)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form Sheet */}
      <ExerciseFormSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setEditingExercise(null);
        }}
        exercise={editingExercise}
        onSubmit={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ejercicio?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMut.mutate(deletingId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
