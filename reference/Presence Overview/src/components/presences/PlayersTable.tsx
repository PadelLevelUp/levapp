import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLUMNS, DEFAULT_VISIBLE, players, type ColumnKey } from "@/lib/presences-data";

export function PlayersTable() {
  const [query, setQuery] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxUnjustified, setMaxUnjustified] = useState("");
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [sortKey, setSortKey] = useState<ColumnKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const shown = COLUMNS.filter((c) => visible.includes(c.key));

  const rows = useMemo(() => {
    const min = minTotal === "" ? -Infinity : Number(minTotal);
    const max = maxUnjustified === "" ? Infinity : Number(maxUnjustified);
    const filtered = players.filter(
      (p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        p.total >= min &&
        p.unjustified <= max,
    );
    return filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [query, minTotal, maxUnjustified, sortKey, sortDir]);

  const toggleSort = (key: ColumnKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const header = shown.map((c) => c.label).join(",");
    const body = rows
      .map((r) => shown.map((c) => (c.key === "name" ? `"${r.name}"` : r[c.key])).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "presences.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">Players</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} of {players.length} players
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search player…"
              className="h-9 w-52 pl-8"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Min. total presences</Label>
            <Input
              type="number"
              min={0}
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
              placeholder="0"
              className="h-9 w-32"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Max. unjustified</Label>
            <Input
              type="number"
              min={0}
              value={maxUnjustified}
              onChange={(e) => setMaxUnjustified(e.target.value)}
              placeholder="any"
              className="h-9 w-28"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Columns3 className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="space-y-1 p-1">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={visible.includes(c.key)}
                      disabled={c.key === "name"}
                      onCheckedChange={(v) =>
                        setVisible((prev) =>
                          v ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-9" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {shown.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground ${
                      c.numeric ? "text-right" : "text-left"
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1 ${active ? "text-foreground" : ""}`}>
                      {c.label}
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/60">
                {shown.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-4 py-3 ${
                      c.numeric ? "text-right tabular-nums text-foreground" : "font-medium text-foreground"
                    }`}
                  >
                    {p[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={shown.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No players match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
