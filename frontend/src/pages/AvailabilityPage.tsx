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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  listBlockers,
  createBlocker,
  updateBlocker,
  deleteBlocker,
  type AvailabilityBlocker,
  type BlockerInput,
} from "@/api/availability";

const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

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

export default function AvailabilityPage() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const describeBlocker = (b: AvailabilityBlocker): string => {
    const time = `${b.startTime ?? ""}–${b.endTime ?? ""}`;
    if (b.isRecurring && b.recurrenceRule) {
      const days = (b.recurrenceRule.daysOfWeek ?? [])
        .map((d) => t(`availability.days.${d}`))
        .filter(Boolean)
        .join(", ");
      return t("availability.everyDays", {
        days: days || t("availability.everyWeek"),
        time,
      });
    }
    return t("availability.dateAndTime", { date: b.date ?? "", time });
  };

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
        title: t("availability.couldNotLoadTitle"),
        description: t("availability.couldNotLoadDescription"),
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
        title: t("availability.dateRequiredTitle"),
        description: t("availability.dateRequiredDescription"),
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
        toast({ title: t("availability.updatedToast") });
      } else {
        await createBlocker(payload);
        toast({ title: t("availability.addedToast") });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await refresh();
    } catch {
      toast({
        variant: "destructive",
        title: t("availability.couldNotSaveTitle"),
        description: t("availability.couldNotSaveDescription"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBlocker(id);
      toast({ title: t("availability.removedToast") });
      await refresh();
    } catch {
      toast({
        variant: "destructive",
        title: t("availability.couldNotRemoveTitle"),
        description: t("availability.couldNotRemoveDescription"),
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
              {t("availability.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("availability.intro")}
            </p>
          </div>
          {!showForm && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              {t("availability.addBlocker")}
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>
                {editingId != null
                  ? t("availability.editBlocker")
                  : t("availability.newBlocker")}
              </CardTitle>
              <CardDescription>
                {t("availability.formDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="blocker-title">{t("availability.titleLabel")}</Label>
                <Input
                  id="blocker-title"
                  placeholder={t("availability.titlePlaceholder")}
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="blocker-recurring">{t("availability.recurringWeekly")}</Label>
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
                  <Label>{t("availability.daysOfWeek")}</Label>
                  <div className="flex gap-1">
                    {DAY_VALUES.map((value) => (
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
                        {t(`availability.dayInitials.${value}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blocker-date">{t("availability.date")}</Label>
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
                  <Label htmlFor="blocker-start">{t("availability.startTime")}</Label>
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
                  <Label htmlFor="blocker-end">{t("availability.endTime")}</Label>
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
                    {t("availability.repeatUntil")}
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
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t("availability.saving") : t("common.save")}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("availability.yourBlockers")}</CardTitle>
            <CardDescription>
              {blockers.length > 0
                ? t("availability.blockersActiveDescription")
                : t("availability.noBlockersDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            )}

            {!loading && blockers.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("availability.noBlockersEmpty")}
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
                        {b.title || t("availability.unavailable")}
                      </p>
                      {b.isRecurring && (
                        <Badge variant="secondary" className="gap-1">
                          <Repeat className="w-3 h-3" />
                          {t("availability.recurring")}
                        </Badge>
                      )}
                      <Badge variant="outline">{t("availability.unavailable")}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {describeBlocker(b)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("availability.wontReceive")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("availability.editBlockerAria")}
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("availability.deleteBlockerAria")}
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
