/**
 * classes.coach-requests-table (PAD-795): the coach's "Pedidos de Aula" as one paged table of
 * private and academy requests, read from `GET /app/coach-requests`. Two tabs with counts (Em aberto,
 * Histórico), eight sortable columns, filters, a pager; sort, filters, tab and page live in the URL so
 * a reload or a shared link reopens the view (rule 11). Actions stay where they were (rule 13), the
 * table follows every request event (rule 14), a row opens its detail (rule 15) and the chat's
 * "propose another time" link opens the form on that request wherever it pages (rule 16).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus } from "lucide-react";
import { queryKeys } from "@levelup/hooks";
import {
  COACH_REQUESTS_SECTION_STATUSES,
  COACH_REQUESTS_SORT_KEYS,
  clubDateOfInstant,
  clubTimeOfInstant,
  coachRequestStatusKey,
  coachRequestsActiveSort,
  coachRequestsQuery,
  switchCoachRequestsSection,
  type CoachRequestsView,
} from "@levelup/config";
import type { CoachRequestRow, CoachRequestsQuery, CoachRequestsSection, CoachRequestsSortKey } from "@levelup/types";
import { getCoachPlayers } from "@levelup/api/src/resources/players";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JoinRequestSide } from "@/components/calendar/JoinRequestSide";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { listCoachRequests } from "@/api/coachRequests";
import { useCoachRequestActions } from "./useCoachRequestActions";

// Rule 11: the eight columns, in order, each with the sort key it presses.
const COLUMNS: { id: string; label: string; sort: CoachRequestsSortKey }[] = [
  { id: "class-day", label: "classDay", sort: "class_date" },
  { id: "class-time", label: "classTime", sort: "class_time" },
  { id: "requested-day", label: "requestedDay", sort: "requested_at" },
  { id: "requested-time", label: "requestedTime", sort: "requested_at" },
  { id: "student", label: "student", sort: "student" },
  { id: "kind", label: "kind", sort: "kind" },
  { id: "side", label: "side", sort: "side" },
  { id: "status", label: "status", sort: "status" },
];

const FILTER_PARAMS = ["kind", "status", "side", "class_from", "class_to", "time_from", "time_to", "requested_from", "requested_to", "player_id"];

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "declined" || status === "rejected") return "destructive";
  if (status === "withdrawn" || status === "superseded") return "outline";
  return "secondary";
}

const instantParts = (iso: string | null) => (iso ? { day: clubDateOfInstant(iso), time: clubTimeOfInstant(iso) } : null);

export function CoachRequestsTable() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { actionsFor, panel, openProposal } = useCoachRequestActions();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const section: CoachRequestsSection = params.get("tab") === "history" ? "history" : "open";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rawSortBy = params.get("sort_by") as CoachRequestsSortKey | null;
  const sortBy = rawSortBy && COACH_REQUESTS_SORT_KEYS.includes(rawSortBy) ? rawSortBy : undefined;
  const sortDir = params.get("sort_dir") === "desc" ? "desc" : params.get("sort_dir") === "asc" ? "asc" : undefined;

  // The URL is the view (rule 11); the shared builder turns it into the request iOS sends too.
  const view: CoachRequestsView = useMemo(() => {
    const get = (key: string) => params.get(key) || undefined;
    return {
      section,
      sortBy,
      sortDir,
      kind: get("kind") as CoachRequestsView["kind"],
      status: get("status"),
      side: get("side") as CoachRequestsView["side"],
      classFrom: get("class_from"),
      classTo: get("class_to"),
      classTimeFrom: get("time_from"),
      classTimeTo: get("time_to"),
      requestedFrom: get("requested_from"),
      requestedTo: get("requested_to"),
      playerId: get("player_id"),
    };
  }, [params, section, sortBy, sortDir]);
  const activeSort = coachRequestsActiveSort(view);
  const query: CoachRequestsQuery = useMemo(() => coachRequestsQuery(view, page), [view, page]);

  const result = useQuery({
    queryKey: queryKeys.coachRequests(query),
    queryFn: () => listCoachRequests(query),
    placeholderData: keepPreviousData,
  });
  const roster = useQuery({ queryKey: queryKeys.coachPlayers, queryFn: getCoachPlayers, staleTime: 60_000 });

  useEffect(() => {
    if (result.isError) toast({ variant: "destructive", title: t("classRequests.loadFailed") });
  }, [result.isError, t, toast]);

  /** Sets or clears URL params; any change of the view but the page itself returns to page 1 (rule 11). */
  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage && !("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  const pressHeader = (key: CoachRequestsSortKey) =>
    update({ sort_by: key, sort_dir: activeSort.by === key && activeSort.dir === "asc" ? "desc" : "asc" });

  const switchTab = (next: CoachRequestsSection) => {
    if (next === section) return;
    // A tab change returns to page 1 and drops the status filter: the two sections share no status.
    const nextView = switchCoachRequestsSection(view, next);
    update({ tab: nextView.section === "history" ? "history" : null, status: nextView.status ?? null });
  };

  // Rule 16: "Propose another time" from the chat reads that one request, whatever page it is on.
  const proposeFor = params.get("proposeFor");
  const openRef = useRef(openProposal);
  openRef.current = openProposal;
  useEffect(() => {
    const wanted = Number(proposeFor);
    if (!wanted) return;
    let live = true;
    const done = () => {
      if (!live) return;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("proposeFor");
          return next;
        },
        { replace: true }
      );
    };
    listCoachRequests({ kind: "private", id: wanted })
      .then((res) => {
        const found = res.items[0];
        if (live && found && found.kind === "private" && found.status === "pending") openRef.current(found);
      })
      .catch(() => undefined)
      .finally(done);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeFor]);

  const data = result.data;
  const items = data?.items ?? [];
  const counts = data?.counts ?? { open: 0, history: 0 };
  const pagination = data?.pagination;
  const hasFilters = FILTER_PARAMS.some((key) => params.get(key));

  // The chip and "Usar … no perfil" belong to a request still to be decided (rule 13); a decided row only names the side.
  const sideWord = (side: NonNullable<CoachRequestRow["side"]>) => t(side === "left" ? "players.sideLeft" : side === "right" ? "players.sideRight" : "players.sideBoth");
  const sideCell = (r: CoachRequestRow) =>
    !r.side ? "—" : r.status === "pending" ? (
      <JoinRequestSide request={{ coachId: r.coachId, playerId: r.playerId, side: r.side, suggestedProfileSide: r.suggestedProfileSide }} />
    ) : (
      sideWord(r.side)
    );

  const detail = (r: CoachRequestRow) => {
    const when = (iso: string | null) => {
      const p = instantParts(iso);
      return p ? `${p.day} ${p.time}` : "—";
    };
    const who =
      r.decidedBy === "student" ? t("classRequests.table.detail.student") : r.decidedBy === "coach" ? t("classRequests.table.detail.coach") : "—";
    return (
      <div className="space-y-1 text-sm" data-testid="coach-request-detail" data-request-id={r.id}>
        <p data-testid="coach-request-detail-note" className="italic">{r.note ? `“${r.note}”` : t("classRequests.table.detail.none")}</p>
        <p data-testid="coach-request-detail-requested-at">{t("classRequests.table.detail.requestedAt", { when: when(r.createdAt) })}</p>
        <p data-testid="coach-request-detail-decided-at">{t("classRequests.table.detail.decidedAt", { when: when(r.decidedAt) })}</p>
        <p data-testid="coach-request-detail-decided-by">{t("classRequests.table.detail.decidedBy", { who })}</p>
        {r.recurrence && (
          <p data-testid="coach-request-detail-recurrence">
            {t("classRequests.table.detail.recurrence", {
              days: r.recurrence.weekdays.map((d) => t(`classRequestWizard.weekdays.${d}`)).join(", "),
              end: r.recurrence.endDate,
            })}
          </p>
        )}
      </div>
    );
  };

  const field = "h-9 rounded-md border bg-background px-2 text-sm";
  const students = (roster.data ?? []).map((p) => ({ id: String(p.playerId), label: p.displayName ?? p.name }));

  return (
    <Card data-testid="class-requests">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="w-5 h-5" />
          {t("classRequests.coachTitle")}
        </CardTitle>
        <CardDescription>{t("classRequests.coachIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {panel}

        <div role="tablist" className="inline-flex rounded-md bg-muted p-1" data-testid="coach-requests-tabs">
          {(["open", "history"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              onClick={() => switchTab(s)}
              className={cn("rounded px-3 py-1 text-sm", section === s ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              data-testid={`coach-requests-tab-${s}`}
            >
              {t(s === "open" ? "classRequests.table.tabOpen" : "classRequests.table.tabHistory")} ({counts[s]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3" data-testid="coach-requests-filters">
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.filters.student")}
            <select className={field} value={params.get("player_id") ?? ""} onChange={(e) => update({ player_id: e.target.value || null })} data-testid="coach-requests-filter-student">
              <option value="">{t("classRequests.table.filters.allStudents")}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.filters.kind")}
            <select className={field} value={params.get("kind") ?? ""} onChange={(e) => update({ kind: e.target.value || null })} data-testid="coach-requests-filter-kind">
              <option value="">{t("classRequests.table.filters.all")}</option>
              <option value="academy">{t("classRequests.table.kind.academy")}</option>
              <option value="private">{t("classRequests.table.kind.private")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.filters.status")}
            <select className={field} value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} data-testid="coach-requests-filter-status">
              <option value="">{t("classRequests.table.filters.all")}</option>
              {COACH_REQUESTS_SECTION_STATUSES[section].map((s) => (
                <option key={s} value={s}>{t(coachRequestStatusKey("academy", s as CoachRequestRow["status"], null))}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.filters.side")}
            <select className={field} value={params.get("side") ?? ""} onChange={(e) => update({ side: e.target.value || null })} data-testid="coach-requests-filter-side">
              <option value="">{t("classRequests.table.filters.all")}</option>
              <option value="left">{t("players.sideLeft")}</option>
              <option value="right">{t("players.sideRight")}</option>
              <option value="both">{t("players.sideBoth")}</option>
              <option value="none">{t("classRequests.table.filters.sideNone")}</option>
            </select>
          </label>
          {([
            ["classDates", "class_from", "class_to", "date", "class"],
            ["classTimes", "time_from", "time_to", "time", "time"],
            ["requestDates", "requested_from", "requested_to", "date", "requested"],
          ] as const).map(([label, fromKey, toKey, type, id]) => (
            <fieldset key={id} className="flex flex-col gap-1 text-xs">
              <legend className="mb-1">{t(`classRequests.table.filters.${label}`)}</legend>
              <div className="flex items-center gap-1">
                <Input type={type} className="h-9 w-auto" aria-label={t("classRequests.table.filters.from")} value={params.get(fromKey) ?? ""} onChange={(e) => update({ [fromKey]: e.target.value || null })} data-testid={`coach-requests-filter-${id}-from`} />
                <Input type={type} className="h-9 w-auto" aria-label={t("classRequests.table.filters.to")} value={params.get(toKey) ?? ""} onChange={(e) => update({ [toKey]: e.target.value || null })} data-testid={`coach-requests-filter-${id}-to`} />
              </div>
            </fieldset>
          ))}
          <Button variant="ghost" size="sm" disabled={!hasFilters} onClick={() => update(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])))} data-testid="coach-requests-clear">
            {t("classRequests.table.filters.clear")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="coach-requests-table">
            <thead>
              <tr className="border-b text-left">
                {COLUMNS.map((c) => {
                  const active = activeSort.by === c.sort;
                  const Icon = active ? (activeSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={c.id} className="p-2 font-medium whitespace-nowrap" aria-sort={active ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => pressHeader(c.sort)} data-testid={`coach-requests-col-${c.id}`} data-sort-key={c.sort}>
                        {t(`classRequests.table.columns.${c.label}`)}
                        <Icon className="w-3 h-3" />
                      </button>
                    </th>
                  );
                })}
                {section === "open" && (
                  <th className="p-2 font-medium" data-testid="coach-requests-col-actions">{t("classRequests.table.columns.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const key = `${r.kind}-${r.id}`;
                const requested = instantParts(r.createdAt);
                const expanded = openKey === key;
                return (
                  <Fragment key={key}>
                    <tr
                      className="cursor-pointer border-b align-top hover:bg-muted/40"
                      onClick={() => setOpenKey(expanded ? null : key)}
                      data-testid="coach-request-row"
                      data-kind={r.kind}
                      data-status={r.status}
                      data-request-id={r.id}
                    >
                      <td className="p-2" data-testid="coach-request-cell-class-day">{r.date ?? "—"}</td>
                      <td className="p-2" data-testid="coach-request-cell-class-time">{r.startTime ? `${r.startTime}–${r.endTime ?? ""}` : "—"}</td>
                      <td className="p-2" data-testid="coach-request-cell-requested-day">{requested?.day ?? "—"}</td>
                      <td className="p-2" data-testid="coach-request-cell-requested-time">{requested?.time ?? "—"}</td>
                      <td className="p-2" data-testid="coach-request-cell-student">{r.displayName}</td>
                      <td className="p-2" data-testid="coach-request-cell-kind">
                        <Badge variant="outline" data-testid="class-join-list-kind">{t(`classRequests.table.kind.${r.kind}`)}</Badge>
                        {r.classTitle && <span className="ml-2 text-muted-foreground">{r.classTitle}</span>}
                      </td>
                      <td className="p-2" data-testid="coach-request-cell-side" onClick={(e) => e.stopPropagation()}>{sideCell(r)}</td>
                      <td className="p-2" data-testid="coach-request-cell-status">
                        <Badge variant={statusVariant(r.status)}>{t(coachRequestStatusKey(r.kind, r.status, r.decidedBy))}</Badge>
                      </td>
                      {section === "open" && (
                        <td className="p-2" data-testid="coach-request-cell-actions" onClick={(e) => e.stopPropagation()}>{actionsFor(r)}</td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="border-b bg-muted/20">
                        <td className="p-3" colSpan={COLUMNS.length + (section === "open" ? 1 : 0)}>{detail(r)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {result.isPending ? (
            <p className="p-3 text-sm text-muted-foreground">…</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground" data-testid="coach-requests-empty">{t("classRequests.table.empty")}</p>
          ) : null}
        </div>

        {pagination && (
          <div className="flex items-center justify-end gap-3" data-testid="coach-requests-pager">
            <Button size="sm" variant="outline" disabled={!pagination.hasPrev} onClick={() => update({ page: String(pagination.page - 1) })} data-testid="coach-requests-pager-prev">
              {t("classRequests.table.pager.previous")}
            </Button>
            <span className="text-sm" data-testid="coach-requests-pager-position">{pagination.page} / {Math.max(pagination.pages, 1)}</span>
            <Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => update({ page: String(pagination.page + 1) })} data-testid="coach-requests-pager-next">
              {t("classRequests.table.pager.next")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
