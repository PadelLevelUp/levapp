/**
 * calendar.student-blockers rules 15–16 (PAD-356): the "Criar bloqueio" sheet.
 * Single or recurring; the reason is the blocker's `title`. Validation and the
 * payload come from @levelup/config's blocker draft, the same module iOS uses.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { blockerDraftError, blockerDraftToInput, blockerToDraft, emptyBlockerDraft, type BlockerDraft } from "@levelup/config";
import type { AvailabilityBlocker, BlockerInput } from "@/api/availability";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Monday-first; values are JS getDay() numbers, as availability.days.<n>.
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  open: boolean;
  /** The blocker being edited, or null to create one. */
  editing: AvailabilityBlocker | null;
  saving: boolean;
  onSave: (payload: BlockerInput) => void;
  onClose: () => void;
}

export function BlockerSheet({ open, editing, saving, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<BlockerDraft>(emptyBlockerDraft());
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? blockerToDraft(editing) : emptyBlockerDraft());
    setShowError(false);
  }, [open, editing]);

  const error = blockerDraftError(draft);
  const recurring = draft.mode === "recurring";
  const set = (patch: Partial<BlockerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleDay = (day: number) =>
    set({ daysOfWeek: draft.daysOfWeek.includes(day) ? draft.daysOfWeek.filter((d) => d !== day) : [...draft.daysOfWeek, day] });

  const save = () => {
    // Rule 16: an invalid draft is explained and never sent.
    if (error) {
      setShowError(true);
      return;
    }
    onSave(blockerDraftToInput(draft));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto" data-testid="blocker-sheet">
        <div className="mx-auto w-full max-w-lg space-y-5">
          <SheetHeader>
            <SheetTitle>{t(editing ? "availability.sheet.editTitle" : "availability.sheet.newTitle")}</SheetTitle>
            <SheetDescription>{t("availability.formDescription")}</SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group">
            {(["single", "recurring"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={draft.mode === mode}
                data-testid={`blocker-mode-${mode}`}
                onClick={() => set({ mode })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  draft.mode === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`availability.mode.${mode}`)}
              </button>
            ))}
          </div>

          {recurring && (
            <div className="space-y-2">
              <Label>{t("availability.daysOfWeek")}</Label>
              <div className="flex flex-wrap gap-1">
                {DAY_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.daysOfWeek.includes(value)}
                    aria-label={t(`availability.days.${value}`)}
                    data-testid={`blocker-day-${value}`}
                    onClick={() => toggleDay(value)}
                    className={cn(
                      "w-9 h-9 rounded-full text-sm font-medium transition-colors",
                      draft.daysOfWeek.includes(value) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted-foreground/10"
                    )}
                  >
                    {t(`availability.dayInitials.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={cn("grid grid-cols-1 gap-4", recurring ? "sm:grid-cols-2" : "")}>
            <div className="space-y-2">
              <Label htmlFor="blocker-date">{t(recurring ? "availability.startDate" : "availability.date")}</Label>
              <Input id="blocker-date" data-testid="blocker-date" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            {recurring && (
              <div className="space-y-2">
                <Label htmlFor="blocker-end-date">{t("availability.endDate")}</Label>
                <Input id="blocker-end-date" data-testid="blocker-end-date" type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="blocker-start-time">{t("availability.startTime")}</Label>
              <Input id="blocker-start-time" data-testid="blocker-start-time" type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blocker-end-time">{t("availability.endTime")}</Label>
              <Input id="blocker-end-time" data-testid="blocker-end-time" type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="blocker-reason">{t("availability.reasonLabel")}</Label>
            <Input
              id="blocker-reason"
              data-testid="blocker-reason"
              placeholder={t("availability.reasonPlaceholder")}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>

          {showError && error && (
            <p className="text-sm text-destructive" role="alert" data-testid="blocker-error" data-reason={error}>
              {t(`availability.validation.${error}`)}
            </p>
          )}

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving} data-testid="blocker-cancel">
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={saving} data-testid="blocker-save">
              {saving ? t("availability.saving") : t("common.save")}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
