import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThumbsUp, ThumbsDown, Pencil, Plus, X } from "lucide-react";
import { CoachNote } from "@/types";
import { USE_MOCK_DATA } from "@/config";
import { api } from "@/api/client";

interface PlayerStrengthsWeaknessesProps {
  strengths: CoachNote[];
  weaknesses: CoachNote[];
  playerId?: string;
  onAddStrength?: (text: string) => void;
  onRemoveStrength?: (index: number, note: CoachNote) => void;
  onAddWeakness?: (text: string) => void;
  onRemoveWeakness?: (index: number, note: CoachNote) => void;
}

export function PlayerStrengthsWeaknesses({
  strengths,
  weaknesses,
  onAddStrength,
  onRemoveStrength,
  onAddWeakness,
  onRemoveWeakness,
}: PlayerStrengthsWeaknessesProps) {
  const [editing, setEditing] = useState(false);
  const [newStrength, setNewStrength] = useState("");
  const [newWeakness, setNewWeakness] = useState("");

  const canEdit = !!(onAddStrength && onRemoveStrength && onAddWeakness && onRemoveWeakness);

  const handleAddStrength = () => {
    const val = newStrength.trim();
    if (!val || !onAddStrength) return;
    onAddStrength(val);
    setNewStrength("");
  };

  const handleAddWeakness = () => {
    const val = newWeakness.trim();
    if (!val || !onAddWeakness) return;
    onAddWeakness(val);
    setNewWeakness("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Strengths & Weaknesses</h3>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            className="h-7 px-2 text-xs"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {editing ? "Done" : "Edit"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Strengths */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strengths.length === 0 && !editing ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 group">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    <span className="flex-1">{s.text}</span>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => onRemoveStrength?.(i, s)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editing && (
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Add a strength..."
                  value={newStrength}
                  onChange={(e) => setNewStrength(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddStrength())}
                  className="flex-1 h-8 text-sm"
                />
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleAddStrength} type="button">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weaknesses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-orange-500" />
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weaknesses.length === 0 && !editing ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 group">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span className="flex-1">{w.text}</span>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => onRemoveWeakness?.(i, w)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editing && (
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Add a weakness..."
                  value={newWeakness}
                  onChange={(e) => setNewWeakness(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddWeakness())}
                  className="flex-1 h-8 text-sm"
                />
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleAddWeakness} type="button">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
