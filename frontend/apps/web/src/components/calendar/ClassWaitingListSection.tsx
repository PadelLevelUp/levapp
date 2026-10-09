/**
 * PAD-547 (calendar.event-detail rules 19–20, notifications.waiting-list rules 18–22): the class's
 * waiting list on its detail sheet — who is on it, where each came from and (PAD-560) for how long,
 * a remove control per row, an edit control that moves a row between the scopes (rule 22), and
 * "Add to waiting list" for this class only, the whole series or a period (rules 18, 19, 19a).
 * Coach only. The picker is one search above a list of rows (B-421: no native select).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import type { ClassWaitingListScopeRequest, CoachClassWaitingListRow, CoachPlayer, EligibilityCheckEntry } from "@levelup/types";
import {
  DEFAULT_STANDING_PRESET,
  clubTodayISO,
  describeIneligible,
  formatShortDate,
  isStandingEndAllowed,
  resolveText,
  standingEndBounds,
  standingEndFor,
  waitingListCandidates,
  waitingListOriginKey,
  waitingListPickerOptions,
  waitingListRowIsManagedInSettings,
  waitingListScopeLabel,
  waitingListScopeOptions,
  wholeSeriesEndPreview,
} from "@levelup/config";
import { addToClassWaitingList, changeClassWaitingListScope, checkEligibility, removeFromClassWaitingList } from "@/api/notificationEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Scope = "occurrence" | "series" | "period";
type PeriodMode = "classes" | "date";
const DEFAULT_PERIOD_CLASSES = 4;
const MAX_PERIOD_CLASSES = 52;

interface Props {
  event: { model: string; originalId: string | number; date?: string | null; isRecurring?: boolean };
  /** The class recurs (the series scopes are offered); falls back to `event.isRecurring`. */
  isRecurring?: boolean;
  /** The series' end date (`YYYY-MM-DD`), for the whole-series "on the list until" line (rule 19). */
  recurrenceEnd?: string | null;
  rows: CoachClassWaitingListRow[];
  roster: CoachPlayer[];
  enrolledIds: Array<string | number>;
  /** Re-read the class after a change (the server's list is the truth). */
  onChanged: () => void;
}

export function ClassWaitingListSection({ event, isRecurring, recurrenceEnd, rows, roster, enrolledIds, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(rows.length > 0);
  const [dialog, setDialog] = useState<null | { editing: CoachClassWaitingListRow | null }>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const recurring = isRecurring ?? event.isRecurring === true;

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
            rows.map((row) => {
              const scope = waitingListScopeLabel(row, (iso) => formatShortDate(iso, i18n.language));
              const managed = waitingListRowIsManagedInSettings(row);
              return (
                <div
                  key={row.id}
                  data-testid={`class-waiting-list-row-${row.playerId}`}
                  data-origin={row.origin}
                  data-scope={row.scope}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm">{row.playerName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t(waitingListOriginKey(row))} · {t(scope.key, scope.params)}
                    </span>
                    {managed ? (
                      <span data-testid={`class-waiting-list-managed-${row.playerId}`} className="text-[11px] text-muted-foreground italic">
                        {t("calendar.detail.waitingListManagedInSettings")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {/* Rule 22: a coach-wide standing row is changed in Settings, not here. */}
                    {!managed ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        data-testid={`class-waiting-list-edit-${row.playerId}`}
                        aria-label={t("calendar.detail.waitingListEditRow")}
                        onClick={() => setDialog({ editing: row })}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    ) : null}
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
                </div>
              );
            })
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 gap-1"
            data-testid="class-waiting-list-add"
            onClick={() => setDialog({ editing: null })}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("calendar.detail.waitingListAdd")}
          </Button>
        </div>
      )}
      <ClassWaitingListDialog
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        onClose={() => setDialog(null)}
        event={event}
        isRecurring={recurring}
        recurrenceEnd={recurrenceEnd ?? null}
        candidates={waitingListCandidates(roster, enrolledIds, rows)}
        onSaved={() => {
          setDialog(null);
          setOpen(true);
          onChanged();
        }}
      />
    </div>
  );
}

/** Rules 18, 19, 19a: what the dialog's choice asks the server for. */
function scopeRequest(scope: Scope, periodMode: PeriodMode, classes: number, expiresOn: string): ClassWaitingListScopeRequest {
  if (scope === "occurrence") return { scope: "occurrence" };
  if (scope === "series") return { scope: "series" };
  return periodMode === "classes" ? { scope: "period", classes } : { scope: "period", expiresOn };
}

function ClassWaitingListDialog({
  open,
  editing,
  onClose,
  event,
  isRecurring,
  recurrenceEnd,
  candidates,
  onSaved,
}: {
  open: boolean;
  /** Rule 22: the row being moved between scopes; null when adding. */
  editing: CoachClassWaitingListRow | null;
  onClose: () => void;
  event: Props["event"];
  isRecurring: boolean;
  recurrenceEnd: string | null;
  candidates: CoachPlayer[];
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [playerId, setPlayerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("occurrence");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("classes");
  const [classes, setClasses] = useState(DEFAULT_PERIOD_CLASSES);
  const [today, setToday] = useState(() => new Date());
  const [expiresOn, setExpiresOn] = useState(() => standingEndFor(DEFAULT_STANDING_PRESET, new Date()));
  const [ineligible, setIneligible] = useState<EligibilityCheckEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setSearch("");
    setIneligible([]);
    setClasses(DEFAULT_PERIOD_CLASSES);
    if (editing) {
      // Rule 22: open on the row's scope and end. A coach-wide row never gets here (no edit control).
      setPlayerId(String(editing.playerId));
      const current: Scope = editing.scope === "series" || editing.scope === "period" ? editing.scope : "occurrence";
      setScope(current);
      setPeriodMode(current === "period" ? "date" : "classes");
      setExpiresOn(editing.expiresOn ?? standingEndFor(DEFAULT_STANDING_PRESET, now));
      return;
    }
    setPlayerId("");
    setScope("occurrence");
    setPeriodMode("classes");
    setExpiresOn(standingEndFor(DEFAULT_STANDING_PRESET, now));
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
  const periodValid =
    scope !== "period" ||
    (periodMode === "classes" ? classes >= 1 && classes <= MAX_PERIOD_CLASSES : isStandingEndAllowed(expiresOn, today));
  const scopes = waitingListScopeOptions(isRecurring);
  const seriesUntil = formatShortDate(wholeSeriesEndPreview(recurrenceEnd, clubTodayISO(today)), i18n.language);
  // PAD-558 (rule 20): the search narrows what is offered; the chosen student stays listed.
  const offered = useMemo(() => waitingListPickerOptions(candidates, search, playerId || null), [candidates, search, playerId]);

  const confirm = async () => {
    if (!playerId || !periodValid) return;
    setSaving(true);
    const req = scopeRequest(scope, periodMode, classes, expiresOn);
    try {
      if (editing) {
        await changeClassWaitingListScope(editing.id, req);
      } else {
        const result = await addToClassWaitingList({
          model: event.model,
          originalId: event.originalId,
          date: event.date,
          playerId: Number(playerId),
          ...req,
        });
        if (result.action === "already_on_list") toast({ title: t("calendar.detail.waitingListAlready") });
      }
      onSaved();
    } catch {
      toast({ variant: "destructive", title: t(editing ? "calendar.detail.waitingListChangeFailed" : "calendar.detail.waitingListAddFailed") });
    } finally {
      setSaving(false);
    }
  };

  const scopeLabel = (s: Scope) =>
    s === "occurrence"
      ? t("calendar.detail.waitingListScopeOccurrence")
      : s === "series"
        ? t("calendar.detail.waitingListScopeSeries")
        : t("calendar.detail.waitingListScopePeriod");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="class-waiting-list-dialog">
        <DialogHeader>
          <DialogTitle>{t(editing ? "calendar.detail.waitingListEdit" : "calendar.detail.waitingListAdd")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {editing ? (
            <p data-testid="class-waiting-list-editing-name" className="text-sm font-medium">{editing.playerName}</p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="class-waiting-list-search"
                  aria-label={t("calendar.detail.waitingListSearch")}
                  placeholder={t("calendar.detail.waitingListSearch")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>
              {/* B-421 (rule 20): the offered students are visible rows the search narrows — no select. */}
              <div data-testid="class-waiting-list-candidates" className="max-h-52 overflow-y-auto overscroll-contain space-y-1">
                {offered.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">{t("calendar.detail.waitingListNoMatch")}</p>
                ) : (
                  offered.map((c) => {
                    const id = String(c.playerId);
                    const reasons = reasonsById.get(id);
                    const chosen = playerId === id;
                    return (
                      <button
                        type="button"
                        key={id}
                        data-testid={`class-waiting-list-candidate-${id}`}
                        data-ineligible={reasons ? true : undefined}
                        aria-pressed={chosen}
                        onClick={() => setPlayerId(id)}
                        className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                          chosen ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="text-sm">{c.name}</span>
                        {reasons ? (
                          <div data-testid={`class-waiting-list-ineligible-${id}`} className="mt-1 text-[11px] text-warning">
                            <p className="flex items-center gap-1 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {t("calendar.detail.waitingListIneligibleHint")}
                            </p>
                            <ul className="ml-4 list-disc text-muted-foreground">
                              {reasons.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
          <div className="space-y-1">
            <span className="text-sm font-medium">{t("calendar.detail.waitingListScope")}</span>
            <div className="flex flex-wrap gap-2">
              {scopes.map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={scope === s ? "default" : "outline"}
                  data-testid={`class-waiting-list-scope-${s}`}
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                >
                  {scopeLabel(s)}
                </Button>
              ))}
            </div>
          </div>
          {scope === "series" ? (
            // Rule 19: the whole series asks nothing more; it says the date the entry will run to.
            <p data-testid="class-waiting-list-series-until" className="text-xs text-muted-foreground">
              {t("calendar.detail.waitingListSeriesRunsTo", { date: seriesUntil })}
            </p>
          ) : null}
          {scope === "period" ? (
            // Rule 19a: exactly one of a number of classes or an end date.
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === "classes" ? "default" : "outline"}
                  data-testid="class-waiting-list-period-classes"
                  aria-pressed={periodMode === "classes"}
                  onClick={() => setPeriodMode("classes")}
                >
                  {t("calendar.detail.waitingListPeriodClasses")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === "date" ? "default" : "outline"}
                  data-testid="class-waiting-list-period-date"
                  aria-pressed={periodMode === "date"}
                  onClick={() => setPeriodMode("date")}
                >
                  {t("calendar.detail.waitingListPeriodUntil")}
                </Button>
              </div>
              {periodMode === "classes" ? (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">{t("calendar.detail.waitingListClasses")}</span>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_PERIOD_CLASSES}
                    data-testid="class-waiting-list-classes"
                    value={classes}
                    onChange={(e) => setClasses(Math.max(1, Math.min(MAX_PERIOD_CLASSES, Number(e.target.value) || 1)))}
                    className="h-9 w-24 text-sm"
                  />
                </label>
              ) : (
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
              )}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={confirm} disabled={saving || !playerId || !periodValid} data-testid="class-waiting-list-confirm">
            {saving && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {t(editing ? "common.save" : "calendar.detail.waitingListAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
