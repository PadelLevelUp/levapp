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
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, ChevronDown } from "lucide-react";
import { queryKeys } from "@levelup/hooks";
import {
  COACH_REQUESTS_SECTION_STATUSES,
  COACH_REQUESTS_SORT_KEYS,
  clubDateOfInstant,
  clubTimeOfInstant,
  coachRequestStatusKey,
  coachRequestsActiveSort,
  coachRequestsQuery,
  PLAYER_SEARCH_DEBOUNCE_MS,
  formatShortDate,
  switchCoachRequestsSection,
  type CoachRequestsView,
} from "@levelup/config";
import type { CoachRequestRow, CoachRequestsQuery, CoachRequestsSection, CoachRequestsSortKey } from "@levelup/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JoinRequestSide } from "@/components/calendar/JoinRequestSide";
import { PlayerSearchFeedback } from "@/components/players/PlayerSearchFeedback";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { listCoachRequests } from "@/api/coachRequests";
import { useCoachRequestActions } from "./useCoachRequestActions";

// Rule 11: the Aula and Pedido columns each carry a day and a time control; the other headers sort by their own key.
const SORT_CONTROLS: Record<string, { label: string; sort: CoachRequestsSortKey }> = {
  "class-day": { label: "day", sort: "class_date" },
  "class-time": { label: "time", sort: "class_time" },
  "requested-day": { label: "day", sort: "requested_at" },
  "requested-time": { label: "time", sort: "requested_at" },
  student: { label: "student", sort: "student" },
  kind: { label: "kind", sort: "kind" },
  side: { label: "side", sort: "side" },
  status: { label: "status", sort: "status" },
};
// The label each sort key carries in the narrow layout's sort select.
const SORT_SELECT_LABEL: Record<CoachRequestsSortKey, string> = {
  class_date: "classDay",
  class_time: "classTime",
  requested_at: "requestedDay",
  student: "student",
  kind: "kind",
  side: "side",
  status: "status",
};

/** Rule 17: below 768 px the page shows cards, not the table. */
function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [narrow, setNarrow] = useState(() => (supported ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [supported]);
  return narrow;
}

const FILTER_PARAMS = ["kind", "status", "side", "class_from", "class_to", "time_from", "time_to", "requested_from", "requested_to", "player_id", "search"];

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "declined" || status === "rejected") return "destructive";
  if (status === "withdrawn" || status === "superseded") return "outline";
  return "secondary";
}

const instantParts = (iso: string | null) => (iso ? { day: clubDateOfInstant(iso), time: clubTimeOfInstant(iso) } : null);

export function CoachRequestsTable() {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language ?? "pt";
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { actionsFor, form, dialog, proposing, openProposal } = useCoachRequestActions();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const narrow = useNarrow();
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      search: get("search"),
    };
  }, [params, section, sortBy, sortDir]);
  const activeSort = coachRequestsActiveSort(view);
  const query: CoachRequestsQuery = useMemo(() => coachRequestsQuery(view, page), [view, page]);

  const result = useQuery({
    queryKey: queryKeys.coachRequests(query),
    queryFn: () => listCoachRequests(query),
    placeholderData: keepPreviousData,
  });

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

  // Rule 7 `search` / players.search rule 10: the box answers locally on each keystroke and asks the
  // server 200 ms after the last one. The URL holds the settled text; the box holds what is typed.
  const urlSearch = (params.get("search") ?? "").trim();
  const [searchText, setSearchText] = useState(urlSearch);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRef = useRef(update);
  updateRef.current = update;
  const settling = searchText.trim() !== urlSearch;
  const typeSearch = (text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      updateRef.current({ search: text.trim() || null });
    }, PLAYER_SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);
  // The URL changed by something else (clear, back, a link): the box follows it, unless a keystroke is pending.
  useEffect(() => {
    if (!searchTimer.current) setSearchText(urlSearch);
  }, [urlSearch]);

  const pressHeader = (key: CoachRequestsSortKey) =>
    update({ sort_by: key, sort_dir: activeSort.by === key && activeSort.dir === "asc" ? "desc" : "asc" });

  const switchTab = (next: CoachRequestsSection) => {
    if (next === section) return;
    // A tab change returns to page 1 and drops the status filter: the two sections share no status.
    const nextView = switchCoachRequestsSection(view, next);
    update({ tab: nextView.section === "history" ? "history" : null, status: nextView.status ?? null, sort_by: nextView.sortBy ?? null, sort_dir: nextView.sortDir ?? null });
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
  const hasFilters = FILTER_PARAMS.some((key) => params.get(key)) || searchText.trim() !== "";
  const searched = searchText.trim() !== "";

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
      return p ? `${formatShortDate(p.day, lang)} ${p.time}` : "—";
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
              end: formatShortDate(r.recurrence.endDate, lang),
            })}
          </p>
        )}
      </div>
    );
  };

  const field = cn("h-9 rounded-md border bg-background px-2 text-sm", narrow && "w-full min-w-0");
  const inputClass = narrow ? "h-9 w-full min-w-0" : "h-9 w-auto";

  // The fields of one request, the same elements (and test ids) in the table and in a card.
  const fields = (r: CoachRequestRow) => {
    const requested = instantParts(r.createdAt);
    return {
      classDay: <span data-testid="coach-request-cell-class-day">{r.date ? formatShortDate(r.date, lang) : "—"}</span>,
      classTime: <span data-testid="coach-request-cell-class-time">{r.startTime ? `${r.startTime}–${r.endTime ?? ""}` : "—"}</span>,
      requestedDay: <span data-testid="coach-request-cell-requested-day">{requested ? formatShortDate(requested.day, lang) : "—"}</span>,
      requestedTime: <span data-testid="coach-request-cell-requested-time">{requested?.time ?? "—"}</span>,
      student: <span data-testid="coach-request-cell-student">{r.displayName}</span>,
      kind: (
        <span data-testid="coach-request-cell-kind" className="inline-flex flex-col items-start gap-0.5">
          <Badge variant="outline" className="whitespace-nowrap" data-testid="class-join-list-kind">{t(`classRequests.table.kind.${r.kind}`)}</Badge>
          {r.classTitle && <span className="text-muted-foreground">{r.classTitle}</span>}
        </span>
      ),
      side: <span data-testid="coach-request-cell-side">{sideCell(r)}</span>,
      status: (
        <span data-testid="coach-request-cell-status">
          <Badge variant={statusVariant(r.status)}>{t(coachRequestStatusKey(r.kind, r.status, r.decidedBy))}</Badge>
        </span>
      ),
    };
  };

  const activeKeys = new Set(items.map((r) => `${r.kind}-${r.id}`));
  // Rule 16: the form sits under its row (or card); a request that is not on the loaded page gets it above the list.
  const formKey = proposing ? `${proposing.kind}-${proposing.id}` : null;
  const orphanForm = form && formKey && !activeKeys.has(formKey) ? form : null;

  const sortHeader = (id: string) => {
    const c = SORT_CONTROLS[id];
    const active = activeSort.by === c.sort;
    const Icon = active ? (activeSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    const label = t(`classRequests.table.columns.${c.label}`);
    return (
      <button type="button" className="inline-flex items-center gap-0.5 font-normal" onClick={() => pressHeader(c.sort)} data-testid={`coach-requests-col-${id}`} data-sort-key={c.sort} aria-sort={active ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}>
        {label}
        <Icon className="h-3 w-3" />
      </button>
    );
  };
  const simpleHeader = (id: string, label: string) => (
    <th className="p-1.5 font-medium text-left align-bottom">
      {sortHeaderLabelled(id, label)}
    </th>
  );
  const sortHeaderLabelled = (id: string, label: string) => {
    const c = SORT_CONTROLS[id];
    const active = activeSort.by === c.sort;
    const Icon = active ? (activeSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button type="button" className="inline-flex items-center gap-1" onClick={() => pressHeader(c.sort)} data-testid={`coach-requests-col-${id}`} data-sort-key={c.sort} aria-sort={active ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}>
        {label}
        <Icon className="h-3 w-3" />
      </button>
    );
  };

  const filterControls = (
    <div className={narrow ? "grid grid-cols-1 gap-3" : "flex flex-wrap items-end gap-3"} data-testid="coach-requests-filters">
      {narrow && (
        <div className="grid grid-cols-2 gap-2" data-testid="coach-requests-sort">
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.sheet.sortBy")}
            <select className={field} value={activeSort.by} onChange={(e) => update({ sort_by: e.target.value, sort_dir: activeSort.dir })} data-testid="coach-requests-sort-select">
              {COACH_REQUESTS_SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t(`classRequests.table.columns.${SORT_SELECT_LABEL[k]}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("classRequests.table.sheet.direction")}
            <select className={field} value={activeSort.dir} onChange={(e) => update({ sort_by: activeSort.by, sort_dir: e.target.value })} data-testid="coach-requests-sort-dir">
              <option value="asc">{t("classRequests.table.sheet.asc")}</option>
              <option value="desc">{t("classRequests.table.sheet.desc")}</option>
            </select>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs">
        {t("classRequests.table.filters.student")}
        <Input
          type="search"
          className={cn("h-9", narrow ? "w-full min-w-0" : "w-48")}
          placeholder={t("classRequests.table.filters.studentSearch")}
          aria-label={t("classRequests.table.filters.student")}
          value={searchText}
          onChange={(e) => typeSearch(e.target.value)}
          data-testid="coach-requests-search"
        />
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
          {COACH_REQUESTS_SECTION_STATUSES[section].map((st) => (
            <option key={st} value={st}>{t(coachRequestStatusKey("academy", st as CoachRequestRow["status"], null))}</option>
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
        <fieldset key={id} className="flex min-w-0 flex-col gap-1 text-xs">
          <legend className="mb-1">{t(`classRequests.table.filters.${label}`)}</legend>
          <div className={narrow ? "grid grid-cols-2 gap-2" : "flex items-center gap-1"}>
            <Input type={type} className={inputClass} aria-label={t("classRequests.table.filters.from")} value={params.get(fromKey) ?? ""} onChange={(e) => update({ [fromKey]: e.target.value || null })} data-testid={`coach-requests-filter-${id}-from`} />
            <Input type={type} className={inputClass} aria-label={t("classRequests.table.filters.to")} value={params.get(toKey) ?? ""} onChange={(e) => update({ [toKey]: e.target.value || null })} data-testid={`coach-requests-filter-${id}-to`} />
          </div>
        </fieldset>
      ))}
      <Button variant="ghost" size="sm" className={narrow ? "justify-self-start" : undefined} disabled={!hasFilters} onClick={() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = null;
        setSearchText("");
        update(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])));
      }} data-testid="coach-requests-clear">
        {t("classRequests.table.filters.clear")}
      </Button>
    </div>
  );

  const emptyOrLoading = result.isPending ? (
    <p className="p-3 text-sm text-muted-foreground">…</p>
  ) : items.length === 0 && !searched ? (
    <p className="p-3 text-sm text-muted-foreground" data-testid="coach-requests-empty">{t("classRequests.table.empty")}</p>
  ) : null;

  const rowTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid="coach-requests-table">
        <thead>
          <tr className="border-b text-left">
            <th className="p-1.5 font-medium align-bottom">
              <div className="flex flex-col gap-0.5">
                <span>{t("classRequests.table.columns.class")}</span>
                <span className="flex gap-2">{sortHeader("class-day")}{sortHeader("class-time")}</span>
              </div>
            </th>
            <th className="p-1.5 font-medium align-bottom">
              <div className="flex flex-col gap-0.5">
                <span>{t("classRequests.table.columns.requested")}</span>
                <span className="flex gap-2">{sortHeader("requested-day")}{sortHeader("requested-time")}</span>
              </div>
            </th>
            {simpleHeader("student", t("classRequests.table.columns.student"))}
            {simpleHeader("kind", t("classRequests.table.columns.kind"))}
            {simpleHeader("side", t("classRequests.table.columns.side"))}
            {simpleHeader("status", t("classRequests.table.columns.status"))}
            {section === "open" && (
              <th className="p-1.5 font-medium align-bottom text-left" data-testid="coach-requests-col-actions">{t("classRequests.table.columns.actions")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const key = `${r.kind}-${r.id}`;
            const f = fields(r);
            const expanded = openKey === key;
            const span = section === "open" ? 7 : 6;
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
                  <td className="p-1.5 whitespace-nowrap"><div className="flex flex-col">{f.classDay}{f.classTime}</div></td>
                  <td className="p-1.5 whitespace-nowrap"><div className="flex flex-col">{f.requestedDay}{f.requestedTime}</div></td>
                  <td className="p-1.5">{f.student}</td>
                  <td className="p-1.5">{f.kind}</td>
                  <td className="p-1.5" onClick={(e) => e.stopPropagation()}>{f.side}</td>
                  <td className="p-1.5">{f.status}</td>
                  {section === "open" && (
                    <td className="p-1.5" data-testid="coach-request-cell-actions" onClick={(e) => e.stopPropagation()}>{actionsFor(r, "menu")}</td>
                  )}
                </tr>
                {formKey === key && form && (
                  <tr className="border-b"><td className="p-2" colSpan={span}>{form}</td></tr>
                )}
                {expanded && (
                  <tr className="border-b bg-muted/20">
                    <td className="p-3" colSpan={span}>{detail(r)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {emptyOrLoading}
    </div>
  );

  // Rule 17: the same requests as cards, with the same fields, actions and detail.
  const cardList = (
    <div className="space-y-2" data-testid="coach-requests-cards">
      {items.map((r) => {
        const key = `${r.kind}-${r.id}`;
        const f = fields(r);
        const expanded = openKey === key;
        return (
          <div
            key={key}
            className="space-y-2 rounded-lg border p-3 text-sm"
            onClick={() => setOpenKey(expanded ? null : key)}
            data-testid="coach-request-row"
            data-kind={r.kind}
            data-status={r.status}
            data-request-id={r.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-medium">{f.student}</div>
              {f.status}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{f.classDay}</span>
              <span>{f.classTime}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex gap-1">{t("classRequests.table.columns.requested")}: {f.requestedDay}</span>
              <span>{f.requestedTime}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {f.kind}
              {f.side}
            </div>
            {section === "open" && r.status === "pending" && <div onClick={(e) => e.stopPropagation()}>{actionsFor(r, "inline")}</div>}
            {formKey === key && form}
            {expanded && detail(r)}
          </div>
        );
      })}
      {emptyOrLoading}
    </div>
  );

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
        {dialog}
        {orphanForm}

        <div role="tablist" className="inline-flex rounded-md bg-muted p-1" data-testid="coach-requests-tabs">
          {(["open", "history"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              onClick={() => switchTab(s)}
              className={cn("rounded px-3 py-1 text-sm whitespace-nowrap", section === s ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              data-testid={`coach-requests-tab-${s}`}
            >
              {t(s === "open" ? "classRequests.table.tabOpen" : "classRequests.table.tabHistory")} ({counts[s]})
            </button>
          ))}
        </div>

        {narrow ? (
          <div className="space-y-3">
            <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} data-testid="coach-requests-filters-toggle">
              {t("classRequests.table.sheet.open")}{hasFilters ? " •" : ""}
              <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
            </Button>
            {filtersOpen && filterControls}
          </div>
        ) : (
          filterControls
        )}

        {/* players.search rule 10: "searching" while the text settles or its answer is on the way, "nobody" when it came back empty. */}
        {searched && (
          <PlayerSearchFeedback query={searchText} searching={settling || result.isPlaceholderData} count={items.length} className="text-sm text-muted-foreground" />
        )}

        {narrow ? cardList : rowTable}

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
