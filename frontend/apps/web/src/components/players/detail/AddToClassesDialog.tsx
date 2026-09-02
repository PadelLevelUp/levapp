import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { CalendarEvent, CoachPlayer } from "@/types";
import { editClass, getClassInstances } from "@/api/classes";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface AddToClassesDialogProps {
  open: boolean;
  onClose: () => void;
  onSave?: (classInstanceIds: string[]) => void;
  player: CoachPlayer;
}

export function AddToClassesDialog({ open, onClose, onSave, player }: AddToClassesDialogProps) {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [classes, setClasses] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const from = format(weekStart, "yyyy-MM-dd");
        const to = format(weekEnd, "yyyy-MM-dd");
        const data = await getClassInstances(from, to);
        if (!cancelled) setClasses(data);
      } catch {
        // PAD-80: a failed fetch used to fall through silently and render the
        // "no classes this week" empty state, which reads as "you have no
        // classes" rather than "we couldn't load them".
        if (!cancelled) {
          setClasses([]);
          toast.error(t("common.somethingWentWrong"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [open, weekStart, weekEnd, t]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  const toggleClass = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const targets = classes.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) return;
    setSaving(true);

    let successCount = 0;
    let failureCount = 0;
    for (const cls of targets) {
      try {
        await editClass(cls, { addPlayers: [String(player.playerId)] }, "single");
        successCount++;
      } catch {
        failureCount++;
      }
    }

    setSaving(false);

    if (successCount > 0) {
      toast.success(t("players.addedToClasses", { name: player.name, count: successCount }));
    }
    if (failureCount > 0) {
      toast.error(t("common.somethingWentWrong"));
    }
    if (successCount > 0) {
      onSave?.(Array.from(selectedIds));
      onClose();
    }
  };

  // Group classes by date
  const classesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    const sorted = [...classes]
      .filter((c) => c.status !== "canceled")
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    for (const cls of sorted) {
      const existing = grouped.get(cls.date) ?? [];
      existing.push(cls);
      grouped.set(cls.date, existing);
    }
    return grouped;
  }, [classes]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {t("players.addToClassesTitle", { name: player.name })}
          </DialogTitle>
          <DialogDescription>
            {t("players.addToClassesDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Week navigation */}
        <div className="flex items-center justify-between py-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("calendar.toolbar.previousWeek")}
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(weekStart, "MMM d", { locale: enUS })} – {format(weekEnd, "MMM d, yyyy", { locale: enUS })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("calendar.toolbar.nextWeek")}
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Class list */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {loading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("players.noClassesThisWeek")}
            </p>
          ) : (
            <div className="space-y-4 py-2">
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayClasses = classesByDate.get(dateStr);
                if (!dayClasses || dayClasses.length === 0) return null;

                return (
                  <div key={dateStr}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {format(day, "EEEE, MMM d", { locale: enUS })}
                    </p>
                    <div className="space-y-2">
                      {dayClasses.map((cls) => {
                        const isSelected = selectedIds.has(cls.id);
                        const isFull =
                          cls.maxPlayers != null &&
                          (cls.participantCount ?? 0) >= cls.maxPlayers;

                        return (
                          <button
                            key={cls.id}
                            type="button"
                            disabled={isFull}
                            onClick={() => toggleClass(cls.id)}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                              isSelected && !isFull
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-accent/50",
                              isFull && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div
                              className="w-1 self-stretch rounded-full shrink-0"
                              style={{ backgroundColor: cls.color ?? "hsl(var(--primary))" }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {cls.title || t("players.unnamedClass")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {cls.startTime} – {cls.endTime}
                                {cls.maxPlayers != null && (
                                  <span className="ml-2">
                                    {t("players.classParticipants", { n: cls.participantCount ?? 0, max: cls.maxPlayers })}
                                  </span>
                                )}
                              </p>
                            </div>
                            {isFull ? (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {t("players.classFull")}
                              </Badge>
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                disabled={isFull}
                                className="shrink-0 pointer-events-none"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={selectedIds.size === 0 || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("players.addToSelectedClasses", { count: selectedIds.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
