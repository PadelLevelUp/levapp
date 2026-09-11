import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Pencil,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PendingValidationClass, PendingValidationPlayer } from "@/types";

import { PresenceMarkToggle } from "./PresenceMarkToggle";
import {
  effectiveMark,
  fromMark,
  undecidedCount,
  type PresenceMark,
} from "@levelup/config";

type Edits = Record<number, Record<number, PresenceMark>>;
type Extras = Record<number, PendingValidationPlayer[]>;

export interface RosterOption {
  id: number;
  name: string;
}

/**
 * PAD-140 — the coach's attendance inbox.
 *
 * Classes that have already run but whose attendance is not finalized, browsed
 * a week at a time, bucketed into "ready to confirm" (everyone answered) and
 * "needs your input" (someone didn't). The coach can bulk-confirm the clean
 * ones, drill into any class to resolve stragglers, add a walk-in, and reopen
 * anything already validated.
 *
 * Nothing is persisted until Validate: the per-player marks live in local
 * `edits` state, layered over the stored values and the response-based prefill
 * (see `@levelup/config`). Validating POSTs the resolved marks, which both
 * records attendance and stamps `validated=true` in one call.
 */
export function ValidateClassesDialog({
  initialOpen,
  pending,
  validated,
  pendingCount,
  weekOffset,
  onWeekChange,
  loading,
  roster,
  onValidate,
  onUnvalidate,
  busyClassIds = [],
}: {
  /** PAD-283: arrive with the dialog already open (`/presences?validate=1`). */
  initialOpen?: boolean;
  pending: PendingValidationClass[];
  validated: PendingValidationClass[];
  /**
   * The trigger's number, from `/pending_validation/count` — the helper the
   * dashboard card reads too (attendance.validation rule 18). `null` while
   * loading; the list below it is the same week's classes.
   */
  pendingCount: number | null;
  weekOffset: number;
  onWeekChange: (next: number) => void;
  loading?: boolean;
  roster: RosterOption[];
  onValidate: (
    classes: Array<{
      lessonInstanceId: number;
      presences: Array<{
        playerId: number;
        status: "present" | "absent";
        justification?: "justified" | "unjustified";
      }>;
    }>
  ) => Promise<void>;
  onUnvalidate: (lessonInstanceId: number) => Promise<void>;
  /**
   * PAD-191 (B-033): every class currently being written. A bulk run lists all
   * of them, so classes 2..N cannot be submitted again mid-run.
   */
  busyClassIds?: number[];
}) {
  const { t, i18n } = useTranslation();

  const [open, setOpen] = useState(initialOpen ?? false);
  const [selected, setSelected] = useState<number[]>([]);
  const [edits, setEdits] = useState<Edits>({});
  const [extras, setExtras] = useState<Extras>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Roster additions are merged in so a walk-in behaves like any other row.
   *
   * Deduped by `playerId`, not just at add time: once the class is validated
   * the refetch returns the walk-in as a real presence row, and a local `extras`
   * entry for the same person would render them twice (with a duplicate React
   * key). The server's row always wins.
   */
  const withExtras = (klass: PendingValidationClass): PendingValidationClass => {
    const added = (extras[klass.lessonInstanceId] ?? []).filter(
      (extra) => !klass.players.some((p) => p.playerId === extra.playerId)
    );
    if (!added.length) return klass;
    return { ...klass, players: [...klass.players, ...added] };
  };

  const pendingClasses = useMemo(() => pending.map(withExtras), [pending, extras]);
  const validatedClasses = useMemo(
    () => validated.map(withExtras),
    [validated, extras]
  );

  const active =
    activeId == null
      ? null
      : [...pendingClasses, ...validatedClasses].find(
          (c) => c.lessonInstanceId === activeId
        ) ?? null;
  const activeIsValidated =
    active != null &&
    validatedClasses.some((c) => c.lessonInstanceId === active.lessonInstanceId);

  const remainingFor = (klass: PendingValidationClass) =>
    undecidedCount(klass.players, edits[klass.lessonInstanceId] ?? {});

  const readyIds = pendingClasses
    .filter((c) => remainingFor(c) === 0)
    .map((c) => c.lessonInstanceId);

  function setMark(classId: number, playerId: number, mark: PresenceMark) {
    setEdits((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] ?? {}), [playerId]: mark },
    }));
  }

  function resolvePayload(klass: PendingValidationClass) {
    const classEdits = edits[klass.lessonInstanceId] ?? {};
    return klass.players.flatMap((player) => {
      const mark = effectiveMark(player, classEdits[player.playerId]);
      if (!mark) return [];
      return [{ playerId: player.playerId, ...fromMark(mark) }];
    });
  }

  async function validateClasses(classes: PendingValidationClass[]) {
    if (!classes.length) return;
    await onValidate(
      classes.map((klass) => ({
        lessonInstanceId: klass.lessonInstanceId,
        presences: resolvePayload(klass),
      }))
    );
    const done = new Set(classes.map((c) => c.lessonInstanceId));
    setSelected((prev) => prev.filter((id) => !done.has(id)));
  }

  async function bulkValidate() {
    const chosen = pendingClasses.filter((c) =>
      selected.includes(c.lessonInstanceId)
    );
    const ready = chosen.filter((c) => remainingFor(c) === 0);
    const needs = chosen.filter((c) => remainingFor(c) > 0);

    if (ready.length) await validateClasses(ready);

    // Never silently force-approve a class with an unanswered player: bounce
    // those back into the selection with an explanation instead.
    if (needs.length) {
      setNotice(t("presences.validate.skipped", { count: needs.length }));
      setSelected(needs.map((c) => c.lessonInstanceId));
    } else {
      setNotice(null);
    }
  }

  function addWalkIn(klass: PendingValidationClass, playerId: number) {
    const option = roster.find((r) => r.id === playerId);
    if (!option) return;
    if (klass.players.some((p) => p.playerId === playerId)) return;

    const walkIn: PendingValidationPlayer = {
      presenceId: -playerId,
      playerId,
      name: option.name,
      response: "none",
      status: null,
      justification: null,
      validated: false,
      lateCancellation: false,
      guest: true,
    };
    setExtras((prev) => ({
      ...prev,
      [klass.lessonInstanceId]: [...(prev[klass.lessonInstanceId] ?? []), walkIn],
    }));
    // A coach only adds someone who is standing in front of them.
    setMark(klass.lessonInstanceId, playerId, "present");
  }

  const weekLabel = useMemo(() => {
    // UTC throughout, and formatted in UTC, so the label always names the same
    // week the page actually queried (see `weekBounds` in PresencesPage).
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7; // Monday-first
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow + weekOffset * 7)
    );
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const name =
      weekOffset === 0
        ? t("presences.week.this")
        : weekOffset === -1
          ? t("presences.week.last")
          : weekOffset === 1
            ? t("presences.week.next")
            : t("presences.week.offset", {
                offset: weekOffset > 0 ? `+${weekOffset}` : weekOffset,
              });
    return `${name} · ${fmt.format(monday)} – ${fmt.format(sunday)}`;
  }, [weekOffset, i18n.language, t]);

  return (
    <>
      <button
        type="button"
        data-testid="presences-validate-trigger"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold" data-testid="presences-validate-count">
            {/* Not a plural form: pt's CLDR "one" category covers 0, so the
                counted string renders "0 aula por validar". An empty queue
                deserves its own sentence anyway. */}
            {pendingCount == null
              ? "…"
              : pendingCount === 0
                ? t("presences.validate.triggerEmpty")
                : t("presences.validate.trigger", { count: pendingCount })}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("presences.validate.triggerHint")}
          </span>
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            // Reopening always lands on the list, never mid-edit.
            setActiveId(null);
            setNotice(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          {active ? (
            <ClassDetail
              klass={active}
              isValidated={activeIsValidated}
              remaining={remainingFor(active)}
              edits={edits[active.lessonInstanceId] ?? {}}
              roster={roster}
              busy={busyClassIds.includes(active.lessonInstanceId)}
              onMark={(playerId, mark) =>
                setMark(active.lessonInstanceId, playerId, mark)
              }
              onAddWalkIn={(playerId) => addWalkIn(active, playerId)}
              onBack={() => setActiveId(null)}
              onValidate={async () => {
                await validateClasses([active]);
                setActiveId(null);
              }}
              onUnvalidate={async () => {
                await onUnvalidate(active.lessonInstanceId);
                setActiveId(null);
              }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("presences.validate.title")}</DialogTitle>
                <DialogDescription>
                  {t("presences.validate.description")}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("presences.week.previous")}
                  onClick={() => onWeekChange(weekOffset - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span
                  data-testid="presences-week-label"
                  className="text-sm font-medium"
                >
                  {weekLabel}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("presences.week.next")}
                  onClick={() => onWeekChange(weekOffset + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!readyIds.length}
                  onClick={() => setSelected(readyIds)}
                >
                  {t("presences.validate.selectReady")}
                </Button>
                <Button
                  size="sm"
                  disabled={!selected.length || busyClassIds.length > 0}
                  onClick={bulkValidate}
                  data-testid="presences-validate-selected"
                >
                  {busyClassIds.length > 0 && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("presences.validate.validateSelected", {
                    count: selected.length,
                  })}
                </Button>
                {selected.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                    {t("presences.validate.clear")}
                  </Button>
                )}
              </div>

              {notice && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-strong"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {notice}
                </p>
              )}

              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <ClassList
                  classes={pendingClasses}
                  selected={selected}
                  edits={edits}
                  roster={roster}
                  busyClassIds={busyClassIds}
                  remainingFor={remainingFor}
                  onToggleSelect={(id) =>
                    setSelected((prev) =>
                      prev.includes(id)
                        ? prev.filter((x) => x !== id)
                        : [...prev, id]
                    )
                  }
                  onMark={setMark}
                  onAddWalkIn={addWalkIn}
                  onOpen={setActiveId}
                  onValidate={(klass) => validateClasses([klass])}
                />
              )}

              {validatedClasses.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("presences.validate.validatedThisWeek")}
                  </h3>
                  {validatedClasses.map((klass) => (
                    <div
                      key={klass.lessonInstanceId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        <span className="truncate">{klass.title}</span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyClassIds.includes(klass.lessonInstanceId)}
                          onClick={() => onUnvalidate(klass.lessonInstanceId)}
                        >
                          {t("presences.validate.undo")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveId(klass.lessonInstanceId)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          {t("presences.validate.edit")}
                        </Button>
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */

function ClassList({
  classes,
  selected,
  edits,
  roster,
  busyClassIds,
  remainingFor,
  onToggleSelect,
  onMark,
  onAddWalkIn,
  onOpen,
  onValidate,
}: {
  classes: PendingValidationClass[];
  selected: number[];
  edits: Edits;
  roster: RosterOption[];
  busyClassIds: number[];
  remainingFor: (klass: PendingValidationClass) => number;
  onToggleSelect: (id: number) => void;
  onMark: (classId: number, playerId: number, mark: PresenceMark) => void;
  onAddWalkIn: (klass: PendingValidationClass, playerId: number) => void;
  onOpen: (id: number) => void;
  onValidate: (klass: PendingValidationClass) => void;
}) {
  const { t, i18n } = useTranslation();

  if (!classes.length) {
    return (
      <p
        data-testid="presences-validate-empty"
        className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
      >
        {t("presences.validate.empty")}
      </p>
    );
  }

  // "Needs your input" first — the whole point of the queue is what's blocked.
  const groups: Array<{ key: "needsInput" | "ready"; items: PendingValidationClass[] }> = [
    { key: "needsInput", items: classes.filter((c) => remainingFor(c) > 0) },
    { key: "ready", items: classes.filter((c) => remainingFor(c) === 0) },
  ];

  const dayFmt = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(`presences.validate.group.${group.key}`, {
                count: group.items.length,
              })}
            </h3>
            {Array.from(new Set(group.items.map((c) => c.date)))
              .sort()
              .map((day) => (
                <div key={day} className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {dayFmt.format(new Date(`${day}T00:00:00Z`))}
                  </p>
                  {group.items
                    .filter((c) => c.date === day)
                    .sort((a, b) =>
                      a.startDatetime.localeCompare(b.startDatetime)
                    )
                    .map((klass) => (
                      <ClassCard
                        key={klass.lessonInstanceId}
                        klass={klass}
                        selected={selected.includes(klass.lessonInstanceId)}
                        remaining={remainingFor(klass)}
                        edits={edits[klass.lessonInstanceId] ?? {}}
                        roster={roster}
                        busy={busyClassIds.includes(klass.lessonInstanceId)}
                        onToggleSelect={() =>
                          onToggleSelect(klass.lessonInstanceId)
                        }
                        onMark={(playerId, mark) =>
                          onMark(klass.lessonInstanceId, playerId, mark)
                        }
                        onAddWalkIn={(playerId) => onAddWalkIn(klass, playerId)}
                        onOpen={() => onOpen(klass.lessonInstanceId)}
                        onValidate={() => onValidate(klass)}
                      />
                    ))}
                </div>
              ))}
          </section>
        ))}
    </div>
  );
}

function ClassCard({
  klass,
  selected,
  remaining,
  edits,
  roster,
  busy,
  onToggleSelect,
  onMark,
  onAddWalkIn,
  onOpen,
  onValidate,
}: {
  klass: PendingValidationClass;
  selected: boolean;
  remaining: number;
  edits: Record<number, PresenceMark>;
  roster: RosterOption[];
  busy?: boolean;
  onToggleSelect: () => void;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onAddWalkIn: (playerId: number) => void;
  onOpen: () => void;
  onValidate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState(false);

  // `startDatetime` is naive UTC; parse and format it as UTC so the rendered
  // time is the class's actual clock time (same rule as AttendanceHistoryList).
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  const available = roster.filter(
    (r) => !klass.players.some((p) => p.playerId === r.id)
  );

  return (
    <div
      data-testid="presences-class-card"
      data-ready={remaining === 0}
      className="rounded-lg border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={t("presences.validate.selectClass", { name: klass.title })}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))} · {klass.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {klass.type ? t(`presences.type.${klass.type}`) : null}
            {remaining > 0
              ? ` · ${t("presences.validate.awaiting", { count: remaining })}`
              : null}
          </span>
        </span>
        <Button
          size="sm"
          disabled={remaining > 0 || busy}
          onClick={onValidate}
          data-testid="presences-validate-class"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("presences.validate.validate")}
        </Button>
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {t("presences.validate.open")}
        </Button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {sortPlayers(klass.players, edits).map((player) => (
          <li
            key={player.playerId}
            className="flex items-center justify-between gap-3"
          >
            <span className="min-w-0 truncate text-sm">
              {player.name}
              {player.guest && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t("presences.guest")}
                </span>
              )}
            </span>
            <PresenceMarkToggle
              playerName={player.name}
              value={effectiveMark(player, edits[player.playerId])}
              onChange={(mark) => onMark(player.playerId, mark)}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-3 flex items-center gap-2">
          <Select onValueChange={(v) => { onAddWalkIn(Number(v)); setAdding(false); }}>
            <SelectTrigger className="h-8 flex-1 text-sm">
              <SelectValue placeholder={t("presences.validate.choosePlayer")} />
            </SelectTrigger>
            <SelectContent>
              {available.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
        </div>
      ) : (
        available.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            {t("presences.validate.addPlayer")}
          </Button>
        )
      )}
    </div>
  );
}

function ClassDetail({
  klass,
  isValidated,
  remaining,
  edits,
  roster,
  busy,
  onMark,
  onAddWalkIn,
  onBack,
  onValidate,
  onUnvalidate,
}: {
  klass: PendingValidationClass;
  isValidated: boolean;
  remaining: number;
  edits: Record<number, PresenceMark>;
  roster: RosterOption[];
  busy?: boolean;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onAddWalkIn: (playerId: number) => void;
  onBack: () => void;
  onValidate: () => void;
  onUnvalidate: () => void;
}) {
  const { t, i18n } = useTranslation();
  // `startDatetime` is naive UTC; parse and format it as UTC so the rendered
  // time is the class's actual clock time (same rule as AttendanceHistoryList).
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const available = roster.filter(
    (r) => !klass.players.some((p) => p.playerId === r.id)
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("presences.validate.back")}
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="truncate">
            {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))} · {klass.title}
          </span>
        </DialogTitle>
        <DialogDescription>
          {klass.type ? t(`presences.type.${klass.type}`) : null}
        </DialogDescription>
      </DialogHeader>

      <p
        className={cn(
          "rounded-lg px-3 py-2 text-sm",
          remaining > 0
            ? "bg-warning/10 text-warning-strong"
            : "bg-success/10 text-success-strong"
        )}
      >
        {remaining > 0
          ? t("presences.validate.awaiting", { count: remaining })
          : t("presences.validate.readyBanner")}
      </p>

      <ul className="space-y-2">
        {sortPlayers(klass.players, edits).map((player) => (
          <li
            key={player.playerId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {player.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`presences.response.${player.response}`)}
                {player.guest ? ` · ${t("presences.guest")}` : ""}
              </span>
            </span>
            <PresenceMarkToggle
              size="md"
              playerName={player.name}
              value={effectiveMark(player, edits[player.playerId])}
              onChange={(mark) => onMark(player.playerId, mark)}
            />
          </li>
        ))}
      </ul>

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select onValueChange={(v) => onAddWalkIn(Number(v))}>
            <SelectTrigger className="h-9 flex-1 text-sm">
              <SelectValue placeholder={t("presences.validate.lastMinute")} />
            </SelectTrigger>
            <SelectContent>
              {available.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {isValidated && (
          <Button variant="ghost" onClick={onUnvalidate} disabled={busy}>
            {t("presences.validate.undoValidation")}
          </Button>
        )}
        <Button variant="outline" onClick={onBack}>
          {t("presences.validate.back")}
        </Button>
        <Button onClick={onValidate} disabled={remaining > 0 || busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isValidated
            ? t("presences.validate.saveChanges")
            : t("presences.validate.validateClass")}
        </Button>
      </div>
    </>
  );
}

/** Undecided players first — the coach should see what's blocking them. */
function sortPlayers(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark>
) {
  return [...players].sort((a, b) => {
    const aDone = effectiveMark(a, edits[a.playerId]) !== null;
    const bDone = effectiveMark(b, edits[b.playerId]) !== null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
