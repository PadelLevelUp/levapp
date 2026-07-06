import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CalendarRange } from "lucide-react";
import type { Season } from "@/types";
import { getSeasons, addSeasons, deleteSeason } from "@/api/seasons";
import { USE_MOCK_DATA } from "@/config";

interface SeasonDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isNew?: boolean;
}

export function SeasonsSection() {
  const { toast } = useToast();
  const [seasons, setSeasons] = useState<SeasonDraft[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    getSeasons()
      .then((data) =>
        setSeasons(
          data.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
          }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = () => {
    setSeasons((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        startDate: "",
        endDate: "",
        isNew: true,
      },
    ]);
  };

  const handleRemove = async (id: string) => {
    const season = seasons.find((s) => s.id === id);
    if (season?.isNew) {
      setSeasons((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    setRemovingId(id);
    try {
      await deleteSeason(id);
      setSeasons((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast({ variant: "destructive", title: "Failed to delete season" });
    } finally {
      setRemovingId(null);
    }
  };

  const handleChange = (
    id: string,
    field: "name" | "startDate" | "endDate",
    value: string
  ) => {
    setSeasons((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = async () => {
    const invalid = seasons.some(
      (s) => !s.name.trim() || !s.startDate || !s.endDate || s.startDate > s.endDate
    );
    if (invalid) {
      toast({
        variant: "destructive",
        title: "Validation error",
        description: "Each season needs a name and a start date on or before the end date.",
      });
      return;
    }

    const payload = seasons.map((s) => ({
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
    }));

    if (USE_MOCK_DATA) {
      toast({ title: "Seasons saved", description: `${seasons.length} seasons updated (mock).` });
      return;
    }

    setSaving(true);
    try {
      const updated = await addSeasons(payload);
      setSeasons(
        updated.map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
        }))
      );
      toast({ title: "Seasons saved", description: `${updated.length} seasons updated.` });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to save seasons",
        description: err?.response?.data?.error || "Failed to save seasons",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading seasons…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4" />
          Seasons
        </CardTitle>
        <CardDescription>
          Define named seasons so classes can recur until a season's end date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_150px_150px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
          <span>Name</span>
          <span>Start</span>
          <span>End</span>
          <span />
        </div>

        {seasons.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No seasons defined yet. Add your first one below.
          </p>
        )}

        {seasons.map((season) => (
          <div
            key={season.id}
            className="grid grid-cols-[1fr_150px_150px_32px] gap-2 items-center rounded-lg border p-2 bg-background"
          >
            <Input
              value={season.name}
              onChange={(e) => handleChange(season.id, "name", e.target.value)}
              placeholder="Season name"
              className="h-8 text-sm"
            />

            <Input
              type="date"
              aria-label="Season start"
              value={season.startDate}
              onChange={(e) => handleChange(season.id, "startDate", e.target.value)}
              className="h-8 text-sm"
            />

            <Input
              type="date"
              aria-label="Season end"
              value={season.endDate}
              onChange={(e) => handleChange(season.id, "endDate", e.target.value)}
              className="h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(season.id)}
              disabled={removingId === season.id}
            >
              {removingId === season.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            Add season
          </Button>

          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save seasons"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
