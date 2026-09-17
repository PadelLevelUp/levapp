import { useEffect, useState } from "react";
import { CalendarOff, Repeat, Trash2, Pencil, CalendarX } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClassRequestsSection } from "@/components/class-requests/ClassRequestsSection";
import { BlockerSheet } from "@/components/availability/BlockerSheet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  listBlockers,
  createBlocker,
  updateBlocker,
  deleteBlocker,
  type AvailabilityBlocker,
  type BlockerInput,
} from "@/api/availability";

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
  // PAD-356 (rule 15): blocks are created and edited in a sheet.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityBlocker | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (b: AvailabilityBlocker) => {
    setEditing(b);
    setSheetOpen(true);
  };

  // The sheet validates and builds the payload (rule 16); this only persists it.
  const handleSave = async (payload: BlockerInput) => {
    try {
      setSaving(true);
      if (editing) {
        await updateBlocker(editing.id, payload);
        toast({ title: t("availability.updatedToast") });
      } else {
        await createBlocker(payload);
        toast({ title: t("availability.addedToast") });
      }
      setSheetOpen(false);
      setEditing(null);
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
      <div className="p-4 md:p-6 space-y-6 max-w-3xl" data-testid="availability-page">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarOff className="w-6 h-6 shrink-0" />
            {t("availability.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("availability.intro")}</p>
        </div>

        {/* PAD-356 (rule 14): two cards, each with its explanation and its own
            action; no floating or header "+". PAD-119: the header stacks below
            `sm` so the action never leaves the viewport. */}
        <Card data-testid="availability-blockers-card">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <CalendarX className="w-5 h-5 shrink-0" />
                  {t("availability.blockersCard.title")}
                </CardTitle>
                <CardDescription>{t("availability.blockersCard.intro")}</CardDescription>
              </div>
              <Button onClick={openCreate} className="gap-2 w-full sm:w-auto sm:shrink-0" data-testid="availability-create-blocker">
                <CalendarX className="w-4 h-4" />
                {t("availability.blockersCard.cta")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            )}

            {!loading && blockers.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="availability-blockers-empty">
                {t("availability.noBlockersEmpty")}
              </div>
            )}

            {!loading &&
              blockers.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  data-testid={`blocker-card-${b.id}`}
                >
                  <div className="min-w-0">
                    {/* PAD-119: the badges can't shrink, so without wrapping
                        they get clipped by the min-w-0 column on mobile. */}
                    <div className="flex flex-wrap items-center gap-2">
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
                      data-testid={`blocker-edit-${b.id}`}
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("availability.deleteBlockerAria")}
                      data-testid={`blocker-delete-${b.id}`}
                      onClick={() => setDeletingId(b.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* PAD-104 / PAD-356: the student books a class in the coach's free time. */}
        <ClassRequestsSection role="student" />
      </div>

      <BlockerSheet
        open={sheetOpen}
        editing={editing}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
      />

      <AlertDialog
        open={deletingId != null}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("availability.deleteBlockerTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("availability.deleteBlockerDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="blocker-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId != null && handleDelete(deletingId)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
