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
import { cn } from "@/lib/utils";
import type { PresencePlayerStats } from "@/types";

/** Every metric column, in display order. `name` is pinned and never hidden. */
const COLUMNS = [
  { key: "name", numeric: false },
  { key: "total", numeric: true },
  { key: "private", numeric: true },
  { key: "academy", numeric: true },
  { key: "justified", numeric: true },
  { key: "unjustified", numeric: true },
  { key: "invitesReceived", numeric: true },
  { key: "invitesJoined", numeric: true },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_VISIBLE: ColumnKey[] = [
  "name",
  "total",
  "private",
  "academy",
  "unjustified",
];

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
export function PresencePlayersTable({
  players,
  loading,
  onFilteredChange,
}: {
  players: PresencePlayerStats[];
  loading?: boolean;
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
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [sortKey, setSortKey] = useState<ColumnKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const shown = COLUMNS.filter((c) => visible.includes(c.key));

  const isFiltered = query.trim() !== "" || minTotal !== "" || maxUnjustified !== "";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const min = minTotal === "" ? -Infinity : Number(minTotal);
    const max = maxUnjustified === "" ? Infinity : Number(maxUnjustified);
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) &&
        p.total >= min &&
        p.unjustified <= max
    );
  }, [players, query, minTotal, maxUnjustified]);

  useEffect(() => {
    onFilteredChange?.(isFiltered ? filtered : null);
  }, [filtered, isFiltered, onFilteredChange]);

  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

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
      shown.map((c) => escape(row[c.key])).join(",")
    );
    const csv = [header.join(","), ...body].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Date-stamped: a coach exporting monthly ends up with distinct files
    // rather than presences(3).csv.
    link.download = `presences-${new Date().toISOString().slice(0, 10)}.csv`;
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
                <label
                  key={column.key}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={visible.includes(column.key)}
                    // The player column is what every other cell is about.
                    disabled={column.key === "name"}
                    onCheckedChange={(checked) =>
                      setVisible((prev) =>
                        checked
                          ? [...prev, column.key]
                          : prev.filter((k) => k !== column.key)
                      )
                    }
                  />
                  {t(`presences.column.${column.key}`)}
                </label>
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
                      className={cn(
                        "whitespace-nowrap px-4 py-3",
                        column.numeric
                          ? "text-right tabular-nums"
                          : "font-medium"
                      )}
                    >
                      {row[column.key]}
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
                    {t("presences.table.empty")}
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
