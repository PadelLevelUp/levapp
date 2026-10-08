/**
 * PAD-547 (calendar.event-detail rules 19–20, notifications.waiting-list rules 18–21): the class's
 * waiting list on its detail sheet — who is on it and where each came from, a remove control per
 * row, and "Add to waiting list" for this class only or the whole series. Coach only.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, X } from "lucide-react";
import type { CoachClassWaitingListRow, CoachPlayer, EligibilityCheckEntry } from "@levelup/types";
import {
  DEFAULT_STANDING_PRESET,
  describeIneligible,
  isStandingEndAllowed,
  resolveText,
  standingEndBounds,
  standingEndFor,
  waitingListCandidates,
  waitingListOriginKey,
} from "@levelup/config";
import { addToClassWaitingList, checkEligibility, removeFromClassWaitingList } from "@/api/notificationEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Props {
  event: { model: string; originalId: string | number; date?: string | null; isRecurring?: boolean };
  rows: CoachClassWaitingListRow[];
  roster: CoachPlayer[];
  enrolledIds: Array<string | number>;
  /** Re-read the class after a change (the server's list is the truth). */
  onChanged: () => void;
}

export function ClassWaitingListSection({ event, rows, roster, enrolledIds, onChanged }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(rows.length > 0);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const remove = async (row: CoachClassWaitingListRow) => {
    setRemovingId(row.id);
    try {
      await removeFromClassWaitingList(row.id);
      onChanged();
    } catch {
      toast({ variant: "destructive", title: t("common.somethingWentWrong") });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div data-testid="class-waiting-list">
      <button
        type="button"
        data-testid="class-waiting-list-toggle"
        aria-expanded={open}
        className="flex items-center justify-between w-full text-sm font-medium py-1"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{t("calendar.detail.waitingList", { count: rows.length })}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("calendar.detail.waitingListEmpty")}</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                data-testid={`class-waiting-list-row-${row.playerId}`}
                data-origin={row.origin}
                className="flex items-center justify-between gap-2 py-1"
              >
                <div className="flex flex-col">
                  <span className="text-sm">{row.playerName}</span>
                  <span className="text-[11px] text-muted-foreground">{t(waitingListOriginKey(row))}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={removingId === row.id}
                  data-testid={`class-waiting-list-remove-${row.playerId}`}
                  aria-label={t("calendar.detail.waitingListRemove")}
                  onClick={() => remove(row)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 gap-1"
            data-testid="class-waiting-list-add"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("calendar.detail.waitingListAdd")}
          </Button>
        </div>
      )}
      <AddToClassWaitingListDialog
        open={adding}
        onClose={() => setAdding(false)}
        event={event}
        candidates={waitingListCandidates(roster, enrolledIds, rows)}
        onAdded={() => {
          setAdding(false);
          setOpen(true);
          onChanged();
        }}
      />
    </div>
  );
}

function AddToClassWaitingListDialog({
  open,
  onClose,
  event,
  candidates,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  event: Props["event"];
  candidates: CoachPlayer[];
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [playerId, setPlayerId] = useState<string>("");
  const [scope, setScope] = useState<"occurrence" | "series">("occurrence");
  const [today, setToday] = useState(() => new Date());
  const [expiresOn, setExpiresOn] = useState(() => standingEndFor(DEFAULT_STANDING_PRESET, new Date()));
  const [credits, setCredits] = useState(3);
  const [ineligible, setIneligible] = useState<EligibilityCheckEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setExpiresOn(standingEndFor(DEFAULT_STANDING_PRESET, now));
    setPlayerId("");
    setScope("occurrence");
    setIneligible([]);
    // Rule 20: mark who would fail the class's bar today, as the class editor's picker does.
    if (candidates.length === 0) return;
    checkEligibility(event.model, String(event.originalId), event.date, candidates.map((c) => c.playerId))
      .then(({ ineligible: failing }) => setIneligible(failing))
      .catch(() => setIneligible([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reasonsById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of describeIneligible(ineligible)) map.set(String(s.playerId), s.reasons.map((r) => resolveText(t, r)));
    return map;
  }, [ineligible, t]);

  const { min, max } = standingEndBounds(today);
  const seriesValid = scope === "occurrence" || isStandingEndAllowed(expiresOn, today);
  const chosenReasons = playerId ? reasonsById.get(playerId) : undefined;

  const confirm = async () => {
    if (!playerId || !seriesValid) return;
    setSaving(true);
    try {
      const result = await addToClassWaitingList({
        model: event.model,
        originalId: event.originalId,
        date: event.date,
        playerId: Number(playerId),
        scope,
        ...(scope === "series" ? { credits, expiresOn } : {}),
      });
      if (result.action === "already_on_list") toast({ title: t("calendar.detail.waitingListAlready") });
      onAdded();
    } catch {
      toast({ variant: "destructive", title: t("calendar.detail.waitingListAddFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="class-waiting-list-dialog">
        <DialogHeader>
          <DialogTitle>{t("calendar.detail.waitingListAdd")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("calendar.detail.waitingListPickStudent")}</span>
            <select
              data-testid="class-waiting-list-player"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="" />
              {candidates.map((c) => (
                <option key={c.playerId} value={String(c.playerId)} data-ineligible={reasonsById.has(String(c.playerId)) || undefined}>
                  {reasonsById.has(String(c.playerId)) ? `⚠ ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          {chosenReasons ? (
            <div data-testid="class-waiting-list-ineligible" className="rounded-md bg-warning/10 p-2 text-xs text-warning">
              <p className="flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("calendar.detail.waitingListIneligibleHint")}
              </p>
              <ul className="ml-4 list-disc">
                {chosenReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="space-y-1">
            <span className="text-sm font-medium">{t("calendar.detail.waitingListScope")}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={scope === "occurrence" ? "default" : "outline"}
                data-testid="class-waiting-list-scope-occurrence"
                aria-pressed={scope === "occurrence"}
                onClick={() => setScope("occurrence")}
              >
                {t("calendar.detail.waitingListScopeOccurrence")}
              </Button>
              {event.isRecurring ? (
                <Button
                  type="button"
                  size="sm"
                  variant={scope === "series" ? "default" : "outline"}
                  data-testid="class-waiting-list-scope-series"
                  aria-pressed={scope === "series"}
                  onClick={() => setScope("series")}
                >
                  {t("calendar.detail.waitingListScopeSeries")}
                </Button>
              ) : null}
            </div>
          </div>
          {scope === "series" ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t("players.endDate")}</span>
                <Input
                  type="date"
                  data-testid="class-waiting-list-end-date"
                  min={min}
                  max={max}
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className="h-9 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t("players.maxClassesToFill")}</span>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  data-testid="class-waiting-list-credits"
                  value={credits}
                  onChange={(e) => setCredits(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="h-9 w-24 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={confirm} disabled={saving || !playerId || !seriesValid} data-testid="class-waiting-list-confirm">
            {saving && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {t("calendar.detail.waitingListAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
