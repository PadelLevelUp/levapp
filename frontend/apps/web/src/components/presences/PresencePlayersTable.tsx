import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  Download,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PINNED_COLUMN,
  PRESENCE_COLUMNS,
  HELPED_COLUMNS,
  balanceSign,
  presenceCellText,
  presenceCellValue,
  presencesCsvFileName,
  type PresenceColumnKey,
} from "@levelup/config";
import { cn } from "@/lib/utils";
import { PlayerSearchFeedback } from "@/components/players/PlayerSearchFeedback";
import { searchPresencePlayers } from "./presenceSearch";
import type { PresencePlayerStats } from "@/types";

// PAD-837 (attendance.validation rule 17c): one column list for both shells, in `@levelup/config`.
const COLUMNS = PRESENCE_COLUMNS;
type ColumnKey = PresenceColumnKey;

/**
 * PAD-140 — per-player attendance across the roster.
 *
 * Filtering and sorting are client-side by design: the endpoint returns one row
 * per roster player, which is small enough that a round-trip per keystroke
 * would be slower and less pleasant than filtering in place.
 *
 * Rows link into the existing per-player attendance history page rather than
 * duplicating it here.
 */
/**
 * A cell's text: the `name` column prints the coach's display name (PAD-683, rule 9a); a number
 * column prints what the one formatter gives (PAD-837, rule 17d: hours as "1h30", the balance
 * with its sign).
 */
function cellOf(row: PresencePlayerStats, key: ColumnKey): string {
  return key === "name" ? (row.displayName ?? row.name) : presenceCellText(row, key);
}

/** The balance's colour follows its sign, never carries it alone (rule 17d). */
function balanceTone(row: PresencePlayerStats): string | undefined {
  const sign = balanceSign(presenceCellValue(row, "balanceMinutes"));
  return sign === "positive" ? "text-emerald-600" : sign === "negative" ? "text-destructive" : undefined;
}

export function PresencePlayersTable({
  players,
  loading,
  onFilteredChange,
  columns: visible,
  onChooseColumn,
}: {
  players: PresencePlayerStats[];
  loading?: boolean;
  /**
   * settings.coach-presences-view (PAD-837): the shown columns and the chooser's change, from the
   * page's saved view (`usePresencesView`), which also holds the coach's default period.
   */
  columns: ColumnKey[];
  onChooseColumn: (key: ColumnKey) => void;
  /**
   * PAD-192 (attendance.validation rule 17a): the rows the filters left
   * visible, or `null` when no filter is active. Sorting and the column
   * chooser are deliberately NOT reported — they change how rows are shown,
   * not which — so the charts above only move when the roster does.
   */
  onFilteredChange?: (rows: PresencePlayerStats[] | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxUnjustified, setMaxUnjustified] = useState("");
  const [sortKey, setSortKey] = useState<ColumnKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const shown = COLUMNS.filter((c) => visible.includes(c.key));

  const isFiltered = query.trim() !== "" || minTotal !== "" || maxUnjustified !== "";

  const filtered = useMemo(() => {
    const min = minTotal === "" ? -Infinity : Number(minTotal);
    const max = maxUnjustified === "" ? Infinity : Number(maxUnjustified);
    // PAD-665: the name goes through the shared rule (best match first); the bounds are unchanged.
    return searchPresencePlayers(players, query).filter(
      (p) => p.total >= min && p.unjustified <= max
    );
  }, [players, query, minTotal, maxUnjustified]);

  useEffect(() => {
    onFilteredChange?.(isFiltered ? filtered : null);
  }, [filtered, isFiltered, onFilteredChange]);

  const rows = useMemo(() => {
    // PAD-665: while a name is typed and the coach has not chosen a sort, best match first.
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // PAD-683 (rule 9a): sorted by the name the coach reads, the server's displayName.
      if (sortKey === "name") return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name) * dir;
      // Every other column sorts by its number, hours by minutes, never by the text (rule 17d).
      return (presenceCellValue(a, sortKey) - presenceCellValue(b, sortKey)) * dir;
    });
  }, [filtered, query, sortKey, sortDir]);

  function toggleSort(key: ColumnKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Counts are most interesting biggest-first; names read A–Z.
    setSortDir(key === "name" ? "asc" : "desc");
  }

  function exportCsv() {
    const escape = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const header = shown.map((c) => escape(t(`presences.column.${c.key}`)));
    const body = rows.map((row) =>
      // The CSV is a file the coach may send on: it keeps the real name (players.nickname rule 7).
      // PAD-837 (rule 17): the same text the screen shows, hours through the one formatter.
      shown.map((c) => escape(c.key === "name" ? row.name : presenceCellText(row, c.key))).join(",")
    );
    const csv = [header.join(","), ...body].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Date-stamped on the club's day: a coach exporting monthly ends up with distinct files
    // rather than presences(3).csv.
    link.download = presencesCsvFileName();
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      data-testid="presences-players-table"
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold">{t("presences.table.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("presences.table.count", {
              shown: rows.length,
              total: players.length,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("presences.table.search")}
              aria-label={t("presences.table.search")}
              className="h-9 w-52 pl-8"
            />
          </div>

          <div>
            <Label
              htmlFor="presences-min-total"
              className="text-[11px] text-muted-foreground"
            >
              {t("presences.table.minTotal")}
            </Label>
            <Input
              id="presences-min-total"
              type="number"
              min={0}
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
              placeholder="0"
              className="h-9 w-28"
            />
          </div>

          <div>
            <Label
              htmlFor="presences-max-unjustified"
              className="text-[11px] text-muted-foreground"
            >
              {t("presences.table.maxUnjustified")}
            </Label>
            <Input
              id="presences-max-unjustified"
              type="number"
              min={0}
              value={maxUnjustified}
              onChange={(e) => setMaxUnjustified(e.target.value)}
              placeholder={t("presences.table.any")}
              className="h-9 w-28"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Columns3 className="mr-1.5 h-4 w-4" />
                {t("presences.table.columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                {t("presences.table.visibleColumns")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((column) => (
                <div key={column.key} className="px-2 py-1.5 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={visible.includes(column.key)}
                      // The player column is what every other cell is about.
                      disabled={column.key === PINNED_COLUMN}
                      onCheckedChange={() => onChooseColumn(column.key)}
                      aria-describedby={
                        HELPED_COLUMNS.includes(column.key)
                          ? `presences-column-help-${column.key}`
                          : undefined
                      }
                    />
                    {t(`presences.column.${column.key}`)}
                  </label>
                  {/* PAD-837 (rule 17e): the guest columns say what they count. */}
                  {HELPED_COLUMNS.includes(column.key) && (
                    <p
                      id={`presences-column-help-${column.key}`}
                      data-testid={`presences-column-help-${column.key}`}
                      className="ml-6 text-xs text-muted-foreground"
                    >
                      {t(`presences.columnHelp.${column.key}`)}
                    </p>
                  )}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-9" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            {t("presences.table.export")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {shown.map((column) => {
                  const active = sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      title={
                        HELPED_COLUMNS.includes(column.key)
                          ? t(`presences.columnHelp.${column.key}`)
                          : undefined
                      }
                      aria-sort={
                        active
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={cn(
                        "whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide",
                        column.numeric ? "text-right" : "text-left"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                          active ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {t(`presences.column.${column.key}`)}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.playerId}
                  data-testid="presences-player-row"
                  onClick={() => navigate(`/players/${row.playerId}/attendance`)}
                  className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/60"
                >
                  {shown.map((column) => (
                    <td
                      key={column.key}
                      data-testid={`presences-cell-${column.key}`}
                      className={cn(
                        "whitespace-nowrap px-4 py-3",
                        column.numeric
                          ? "text-right tabular-nums"
                          : "font-medium",
                        column.key === "balanceMinutes" && balanceTone(row)
                      )}
                    >
                      {cellOf(row, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={shown.length}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {query.trim() ? (
                      <PlayerSearchFeedback query={query} count={0} className="text-sm text-muted-foreground" />
                    ) : (
                      t("presences.table.empty")
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
