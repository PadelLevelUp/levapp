import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CourtDiagramEditor } from "@/components/training/CourtDiagramEditor";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { ExercisePayload, CourtDiagram, Exercise, Difficulty, ExerciseType } from "@/types/training";
import { getCoachLevels } from "@/api/coachLevel";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise?: Exercise | null;
  onSubmit: (data: ExercisePayload) => void;
  loading?: boolean;
}

const emptyDiagram: CourtDiagram = { elements: [] };

export function ExerciseFormSheet({ open, onOpenChange, exercise, onSubmit, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ExerciseType>("attack");
  const [customType, setCustomType] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [diagram, setDiagram] = useState<CourtDiagram>(emptyDiagram);
  const [notes, setNotes] = useState("");

  const { data: levels = [] } = useQuery({
    queryKey: ["coach_levels"],
    queryFn: getCoachLevels,
  });

  // Reset form when exercise changes
  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setDescription(exercise.description || "");
      setType(exercise.type);
      setCustomType(exercise.customType || "");
      setDifficulty(exercise.difficulty);
      setSelectedLevels(exercise.levelIds);
      setDiagram(exercise.diagram || emptyDiagram);
      setNotes(exercise.notes || "");
    } else {
      setName("");
      setDescription("");
      setType("attack");
      setCustomType("");
      setDifficulty(1);
      setSelectedLevels([]);
      setDiagram(emptyDiagram);
      setNotes("");
    }
  }, [exercise, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      type,
      customType: type === "custom" ? customType : undefined,
      difficulty,
      levelIds: selectedLevels,
      diagram: diagram.elements.length > 0 ? diagram : undefined,
      notes: notes || undefined,
    });
  }

  function toggleLevel(id: string) {
    setSelectedLevels((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{exercise ? "Editar ejercicio" : "Nuevo ejercicio"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Nombre *</Label>
            <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Bandeja cruzada" required />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ex-desc">Descripción</Label>
            <Textarea id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe el ejercicio..." rows={3} />
          </div>

          {/* Type + Custom */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={type} onValueChange={(v) => setType(v as ExerciseType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="ex-custom-type">Tipo personalizado</Label>
                <Input id="ex-custom-type" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Ej: Táctica" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Dificultad *</Label>
              <Select value={String(difficulty)} onValueChange={(v) => setDifficulty(Number(v) as Difficulty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Levels */}
          {levels.length > 0 && (
            <div className="space-y-1.5">
              <Label>Niveles</Label>
              <div className="flex flex-wrap gap-1.5">
                {levels.map((level) => {
                  const isSelected = selectedLevels.includes(level.id);
                  return (
                    <Badge
                      key={level.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggleLevel(level.id)}
                    >
                      {level.label}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Court Diagram */}
          <CourtDiagramEditor value={diagram} onChange={setDiagram} />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="ex-notes">Notas adicionales</Label>
            <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Variaciones, puntos clave..." rows={2} />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? "Guardando..." : exercise ? "Guardar cambios" : "Crear ejercicio"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
