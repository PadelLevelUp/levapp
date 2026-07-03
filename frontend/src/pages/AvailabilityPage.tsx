import { useEffect, useState } from "react";
import { format, addMonths } from "date-fns";
import { CalendarOff, Repeat, Trash2, Plus, Pencil } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  listBlockers,
  createBlocker,
  updateBlocker,
  deleteBlocker,
  type AvailabilityBlocker,
  type BlockerInput,
} from "@/api/availability";

const DAYS_OF_WEEK = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

interface BlockerFormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  selectedDays: number[];
  endDate: string;
}

const emptyForm = (): BlockerFormState => ({
  title: "",
  date: "",
  startTime: "18:00",
  endTime: "20:00",
  isRecurring: false,
  selectedDays: [],
  endDate: "",
});

function describeBlocker(b: AvailabilityBlocker): string {
  const time = `${b.startTime ?? ""}–${b.endTime ?? ""}`;
  if (b.isRecurring && b.recurrenceRule) {
    const days = (b.recurrenceRule.daysOfWeek ?? [])
      .map((d) => DAY_LABELS[d])
      .filter(Boolean)
      .join(", ");
    return `Every ${days || "week"} · ${time}`;
  }
  return `${b.date ?? ""} · ${time}`;
}

export default function AvailabilityPage() {
  const { toast } = useToast();
  const [blockers, setBlockers] = useState<AvailabilityBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BlockerFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await listBlockers();
      setBlockers(data);
    } catch {
      toast({
        variant: "destructive",
        title: "Could not load blockers",
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (b: AvailabilityBlocker) => {
    setEditingId(b.id);
    setForm({
      title: b.title ?? "",
      date: b.date ?? "",
      startTime: b.startTime ?? "18:00",
      endTime: b.endTime ?? "20:00",
      isRecurring: b.isRecurring,
      selectedDays: b.recurrenceRule?.daysOfWeek ?? [],
      endDate: b.recurrenceEnd ?? "",
    });
    setShowForm(true);
  };

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      selectedDays: f.selectedDays.includes(day)
        ? f.selectedDays.filter((d) => d !== day)
        : [...f.selectedDays, day],
    }));
  };

  const handleSave = async () => {
    if (!form.date) {
      toast({
        variant: "destructive",
        title: "Date required",
        description: "Please pick a date for the blocker.",
      });
      return;
    }
    let days = form.selectedDays;
    if (form.isRecurring && days.length === 0) {
      // Default recurring blocker to the weekday of the chosen date.
      days = [new Date(form.date).getDay()];
    }

    const payload: BlockerInput = {
      title: form.title || null,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      isRecurring: form.isRecurring,
      recurrenceRule: form.isRecurring
        ? { frequency: "weekly", daysOfWeek: days }
        : null,
      endDate: form.isRecurring
        ? form.endDate || format(addMonths(new Date(form.date), 3), "yyyy-MM-dd")
        : null,
    };

    try {
      setSaving(true);
      if (editingId != null) {
        await updateBlocker(editingId, payload);
        toast({ title: "Blocker updated" });
      } else {
        await createBlocker(payload);
        toast({ title: "Blocker added" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Could not save blocker",
        description: "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBlocker(id);
      toast({ title: "Blocker removed" });
      await refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Could not remove blocker",
        description: "Please try again.",
      });
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarOff className="w-6 h-6" />
              Availability
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Set blockers for times you're unavailable. You won't receive
              automatic class invitations during a blocker. Your coach can still
              add you to a class manually.
            </p>
          </div>
          {!showForm && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Add blocker
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>
                {editingId != null ? "Edit blocker" : "New blocker"}
              </CardTitle>
              <CardDescription>
                Choose a one-time date or a recurring weekly pattern.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="blocker-title">Title (optional)</Label>
                <Input
                  id="blocker-title"
                  placeholder="e.g. Away for work"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="blocker-recurring">Recurring weekly</Label>
                </div>
                <Switch
                  id="blocker-recurring"
                  checked={form.isRecurring}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isRecurring: v }))
                  }
                />
              </div>

              {form.isRecurring && (
                <div className="space-y-2">
                  <Label>Days of the week</Label>
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleDay(value)}
                        className={cn(
                          "w-9 h-9 rounded-full text-sm font-medium transition-colors",
                          form.selectedDays.includes(value)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted-foreground/10"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blocker-date">Date</Label>
                  <Input
                    id="blocker-date"
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blocker-start">Start time</Label>
                  <Input
                    id="blocker-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blocker-end">End time</Label>
                  <Input
                    id="blocker-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                  />
                </div>
              </div>

              {form.isRecurring && (
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="blocker-enddate">
                    Repeat until (optional)
                  </Label>
                  <Input
                    id="blocker-enddate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                  />
                </div>
              )}
            </CardContent>
            <Separator />
            <CardContent className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your blockers</CardTitle>
            <CardDescription>
              {blockers.length > 0
                ? "During these windows you won't receive auto-invitations."
                : "You have no blockers set."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}

            {!loading && blockers.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No blockers yet. Add one to stop auto-invitations when you're
                unavailable.
              </div>
            )}

            {!loading &&
              blockers.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {b.title || "Unavailable"}
                      </p>
                      {b.isRecurring && (
                        <Badge variant="secondary" className="gap-1">
                          <Repeat className="w-3 h-3" />
                          Recurring
                        </Badge>
                      )}
                      <Badge variant="outline">Unavailable</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {describeBlocker(b)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Won't receive auto-invitations during this time.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit blocker"
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete blocker"
                      onClick={() => handleDelete(b.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
