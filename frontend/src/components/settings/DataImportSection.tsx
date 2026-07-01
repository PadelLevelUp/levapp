import { useState, useCallback, useRef, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Brain,
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  Pencil,
  Settings2,
} from "lucide-react";
import {
  analyzeFile,
  confirmImportStream,
  type AnalyzeSSEEvent,
} from "@/api/import";
import { useToast } from "@/hooks/use-toast";
import { Phase, ImportTableRow, ImportTable, ThinkingLine } from "@/types";

const TABLE_ICONS: Record<string, string> = {
  "Coach Levels": "🏷️",
  "Evaluation Categories": "📊",
  Players: "🎾",
  Classes: "📅",
  "Players in Classes": "👥",
  Presences: "✅",
  Evaluations: "📝",
  Strengths: "💪",
  Weaknesses: "🎯",
};

/** Tables the user can toggle on/off */
const SELECTABLE_TABLES = [
  { key: "Players", label: "Players", icon: "🎾", description: "Player profiles and contact info" },
  { key: "Classes", label: "Classes", icon: "📅", description: "Training sessions and schedules" },
  { key: "Players in Classes", label: "Players in Classes", icon: "👥", description: "Which players attend which class" },
  { key: "Presences", label: "Presences", icon: "✅", description: "Attendance records" },
  { key: "Evaluations", label: "Evaluations", icon: "📝", description: "Player scores and assessments" },
  { key: "Strengths", label: "Strengths", icon: "💪", description: "Player strengths" },
  { key: "Weaknesses", label: "Weaknesses", icon: "🎯", description: "Areas for improvement" },
] as const;

const GROUP_BY_MAP: Record<string, string> = {
  "Players in Classes": "Class",
  Presences: "Class",
};

/* ---------- AI spinner ---------- */

function AiSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div className="absolute w-12 h-12 rounded-full border-2 border-primary/20 animate-ping" />
      <div className="absolute w-10 h-10 rounded-full border-2 border-t-primary border-r-primary/40 border-b-primary/10 border-l-primary/40 animate-spin" />
      <Sparkles className="w-5 h-5 text-primary animate-pulse" />
    </div>
  );
}

/* ---------- phase indicator ---------- */

const phaseConfig: { key: Phase; label: string; icon: React.ReactNode }[] = [
  { key: "uploading", label: "Upload", icon: <Upload className="w-4 h-4" /> },
  { key: "processing", label: "Process", icon: <FileText className="w-4 h-4" /> },
  { key: "analyzing", label: "AI Analysis", icon: <Brain className="w-4 h-4" /> },
  { key: "done", label: "Results", icon: <Check className="w-4 h-4" /> },
];

const PHASE_ORDER: Phase[] = ["uploading", "processing", "analyzing", "done"];

function PhaseIndicator({ current }: { current: Phase }) {
  const currentIdx = PHASE_ORDER.indexOf(current);

  return (
    <div className="flex items-center gap-2">
      {phaseConfig.map((p, i) => {
        const idx = PHASE_ORDER.indexOf(p.key);
        const isActive = idx === currentIdx;
        const isDone = idx < currentIdx;

        return (
          <div key={p.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full transition-colors duration-500",
                  isDone ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-500",
                isDone && "bg-primary/10 text-primary",
                isActive &&
                  "bg-primary text-primary-foreground shadow-md shadow-primary/25",
                !isDone && !isActive && "bg-muted text-muted-foreground"
              )}
            >
              {isDone ? <Check className="w-3 h-3" /> : p.icon}
              <span className="hidden sm:inline">{p.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- thinking log ---------- */

function ThinkingLog({ lines }: { lines: ThinkingLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="rounded-lg border bg-muted/30 p-4 max-h-48 overflow-y-auto scrollbar-thin font-mono text-xs space-y-1.5">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 transition-opacity duration-300",
            line.done ? "opacity-60" : "opacity-100"
          )}
        >
          {line.done ? (
            <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
          ) : (
            <Loader2 className="w-3 h-3 text-primary mt-0.5 shrink-0 animate-spin" />
          )}
          <span className={cn(!line.done && "text-foreground font-medium")}>
            {line.text}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ---------- table selection step ---------- */

function TableSelectionStep({
  selectedTables,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onCancel,
  fileName,
}: {
  selectedTables: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  fileName: string;
}) {
  const allSelected = selectedTables.size === SELECTABLE_TABLES.length;

  return (
    <div className="space-y-5">
      {/* File info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              Choose what to import from this file
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
          <X className="w-4 h-4" />
          Cancel
        </Button>
      </div>

      {/* Selection header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">What would you like to import?</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {/* Table checkboxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SELECTABLE_TABLES.map((t) => {
          const isSelected = selectedTables.has(t.key);
          return (
            <div
              key={t.key}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(t.key)}
              onKeyDown={(e) => e.key === "Enter" && onToggle(t.key)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all",
                isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
              )}
            >
              <Checkbox checked={isSelected} tabIndex={-1} />
              <span className="text-base">{t.icon}</span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    !isSelected && "text-muted-foreground"
                  )}
                >
                  {t.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note about auto-included tables */}
      <p className="text-xs text-muted-foreground">
        Coach Levels and Evaluation Categories are automatically included when needed.
      </p>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={selectedTables.size === 0}
          className="gap-2"
        >
          <Brain className="w-4 h-4" />
          Analyze {selectedTables.size}{" "}
          {selectedTables.size === 1 ? "table" : "tables"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- editable cell ---------- */

function EditableCell({
  value,
  editing,
  onChange,
}: {
  value: string;
  editing: boolean;
  onChange: (val: string) => void;
}) {
  if (!editing) return <span>{value || "—"}</span>;

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-xs px-2 py-1 min-w-[60px]"
    />
  );
}

/* ---------- grouped table body ---------- */

function GroupedTableBody({
  table,
  groupByCol,
  editing,
  onToggleRow,
  onCellChange,
  onRemoveColumn,
}: {
  table: ImportTable;
  groupByCol: string;
  editing: boolean;
  onToggleRow: (rowId: string) => void;
  onCellChange: (rowId: string, col: string, val: string) => void;
  onRemoveColumn: (col: string) => void;
}) {
  const otherCols = table.columns.filter((c) => c !== groupByCol);
  const groups = new Map<string, ImportTableRow[]>();
  for (const row of table.rows) {
    const key = row.cells[groupByCol] || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            {otherCols.map((col) => (
              <TableHead key={col} className="text-xs whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <span>{col}</span>
                  {editing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveColumn(col)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(groups.entries()).map(([groupName, rows]) => (
            <Fragment key={groupName}>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={otherCols.length + 1} className="py-2">
                  <span className="text-xs font-semibold text-foreground">
                    {groupName}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({rows.filter((r) => r.selected).length}/{rows.length})
                  </span>
                </TableCell>
              </TableRow>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "transition-colors",
                    !row.selected && "opacity-50"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={() => onToggleRow(row.id)}
                    />
                  </TableCell>
                  {otherCols.map((col) => (
                    <TableCell key={col} className="text-xs py-1.5">
                      <EditableCell
                        value={row.cells[col] || ""}
                        editing={editing && row.selected}
                        onChange={(val) => onCellChange(row.id, col, val)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- import table view ---------- */

function ImportTableView({
  table,
  onToggleAll,
  onToggleRow,
  onToggleExpand,
  onCellChange,
  onRemoveColumn,
  groupByCol,
}: {
  table: ImportTable;
  onToggleAll: () => void;
  onToggleRow: (rowId: string) => void;
  onToggleExpand: () => void;
  onCellChange: (rowId: string, col: string, val: string) => void;
  onRemoveColumn: (col: string) => void;
  groupByCol?: string;
}) {
  const [editing, setEditing] = useState(false);
  const selectedCount = table.rows.filter((r) => r.selected).length;

  return (
    <div className="rounded-lg border overflow-hidden animate-fade-in">
      <div
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggleExpand()}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{table.icon}</span>
          <span className="font-medium text-sm">{table.name}</span>
          <Badge variant="secondary" className="text-xs">
            {selectedCount}/{table.rows.length} selected
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {table.expanded && (
            <Button
              variant={editing ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(!editing);
              }}
            >
              <Pencil className="w-3 h-3" />
              {editing ? "Done" : "Edit"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onToggleAll();
            }}
          >
            {table.allSelected ? "Deselect all" : "Select all"}
          </Button>
          {table.expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {table.expanded && groupByCol ? (
        <GroupedTableBody
          table={table}
          groupByCol={groupByCol}
          editing={editing}
          onToggleRow={onToggleRow}
          onCellChange={onCellChange}
          onRemoveColumn={onRemoveColumn}
        />
      ) : table.expanded ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                {table.columns.map((col) => (
                  <TableHead key={col} className="text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{col}</span>
                      {editing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveColumn(col)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "transition-colors",
                    !row.selected && "opacity-50"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={() => onToggleRow(row.id)}
                    />
                  </TableCell>
                  {table.columns.map((col) => (
                    <TableCell key={col} className="text-xs py-1.5">
                      <EditableCell
                        value={row.cells[col] || ""}
                        editing={editing && row.selected}
                        onChange={(val) => onCellChange(row.id, col, val)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- import results view ---------- */

interface TableImportResult {
  imported: number;
  errors: Array<{ row: number; error: string }>;
}

function ImportResultsView({
  tables,
  results,
  onReset,
}: {
  tables: ImportTable[];
  results: Record<string, TableImportResult>;
  onReset: () => void;
}) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(
    () => new Set()
  );

  const totalImported = Object.values(results).reduce(
    (s, r) => s + r.imported,
    0
  );
  const totalErrors = Object.values(results).reduce(
    (s, r) => s + r.errors.length,
    0
  );

  const toggleExpand = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Separator />

      <div className="rounded-lg px-4 py-3 flex items-center justify-between bg-green-50 border border-green-200">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            {totalErrors === 0
              ? `All ${totalImported} records imported successfully`
              : `${totalImported} records imported, ${totalErrors} failed`}
          </span>
        </div>
        <Button size="sm" onClick={onReset}>
          Import another file
        </Button>
      </div>

      <div className="space-y-2">
        {tables.map((table) => {
          const result = results[table.name];
          if (!result) return null;

          const hasErrors = result.errors.length > 0;
          const isExpanded = expandedTables.has(table.name);
          const sentRows = table.rows.filter((r) => r.selected);

          return (
            <div key={table.name} className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{table.icon}</span>
                  <span className="font-medium text-sm">{table.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {result.imported > 0 && (
                    <Badge className="gap-1 text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                      <Check className="w-3 h-3" />
                      {result.imported} imported
                    </Badge>
                  )}
                  {hasErrors && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <X className="w-3 h-3" />
                      {result.errors.length} failed
                    </Badge>
                  )}
                  {hasErrors && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleExpand(table.name)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      {isExpanded ? "Hide" : "Show"} errors
                    </Button>
                  )}
                </div>
              </div>

              {hasErrors && isExpanded && (
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        {table.columns.map((col) => (
                          <TableHead
                            key={col}
                            className="text-xs whitespace-nowrap"
                          >
                            {col}
                          </TableHead>
                        ))}
                        <TableHead className="text-xs text-destructive whitespace-nowrap">
                          Error
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map(({ row: rowIdx, error }) => {
                        const row = sentRows[rowIdx];
                        if (!row) return null;
                        return (
                          <TableRow key={rowIdx} className="bg-red-50/40">
                            {table.columns.map((col) => (
                              <TableCell key={col} className="text-xs py-1.5">
                                {row.cells[col] || "—"}
                              </TableCell>
                            ))}
                            <TableCell className="text-xs py-1.5 text-destructive font-medium max-w-[240px]">
                              {error}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export function DataImportSection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(
    () => new Set(SELECTABLE_TABLES.map((t) => t.key))
  );
  const [thinking, setThinking] = useState<ThinkingLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [tables, setTables] = useState<ImportTable[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<Record<
    string,
    TableImportResult
  > | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Step 1: User drops/selects a file -> go to table selection
  const handleFilePicked = useCallback((file: File) => {
    setPendingFile(file);
    setFileName(file.name);
    setPhase("selecting");
  }, []);

  // Step 2: User confirms table selection -> start analysis
  const startAnalysis = useCallback(
    async (file: File, requestedTables: string[]) => {
      setThinking([]);
      setProgress(0);
      setTables([]);
      setImportResults(null);
      setPhase("uploading");

      try {
        await analyzeFile(file, (event: AnalyzeSSEEvent) => {
          switch (event.type) {
            case "thinking":
              setThinking((prev) => {
                const updated =
                  prev.length > 0
                    ? prev.map((l, idx) =>
                        idx === prev.length - 1 && !l.done
                          ? { ...l, done: true }
                          : l
                      )
                    : prev;
                return [...updated, { text: event.text, done: false }];
              });
              break;
            case "phase":
              setPhase(event.phase as Phase);
              break;
            case "progress":
              setProgress(event.value);
              break;
            case "tables": {
              const tablesObj = event.tables as Record<
                string,
                Array<Record<string, unknown>>
              >;
              const mapped: ImportTable[] = Object.entries(tablesObj).map(
                ([name, rows]) => {
                  const rowArray = rows as Array<Record<string, unknown>>;
                  const columns =
                    rowArray.length > 0 ? Object.keys(rowArray[0]) : [];
                  return {
                    name,
                    icon: TABLE_ICONS[name] || "📄",
                    columns,
                    rows: rowArray.map((r, i) => ({
                      id: `${name}-${i}`,
                      cells: Object.fromEntries(
                        Object.entries(r).map(([k, v]) => [
                          k,
                          v == null ? "" : String(v),
                        ])
                      ),
                      selected: true,
                    })),
                    allSelected: true,
                    expanded: false,
                  };
                }
              );
              setTables(mapped);
              break;
            }
            case "error":
              toast({
                title: "Analysis error",
                description: event.message,
                variant: "destructive",
              });
              break;
            case "done":
              setThinking((prev) =>
                prev.map((l, idx) =>
                  idx === prev.length - 1 ? { ...l, done: true } : l
                )
              );
              setProgress(100);
              setPhase("done");
              break;
          }
        }, { requestedTables });
      } catch (e: any) {
        toast({
          title: "Analysis failed",
          description: e.message,
          variant: "destructive",
        });
        setPhase("idle");
      }
    },
    [toast]
  );

  const handleConfirmTableSelection = useCallback(() => {
    if (!pendingFile) return;
    const tables = Array.from(selectedTables);
    startAnalysis(pendingFile, tables);
  }, [pendingFile, selectedTables, startAnalysis]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFilePicked(file);
    },
    [handleFilePicked]
  );

  const handleReset = () => {
    setPhase("idle");
    setFileName("");
    setPendingFile(null);
    setThinking([]);
    setProgress(0);
    setTables([]);
    setImportResults(null);
    setImportProgress(0);
    setSelectedTables(new Set(SELECTABLE_TABLES.map((t) => t.key)));
  };

  const toggleTableSelection = (key: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = (tableIdx: number) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIdx) return t;
        const newSelected = !t.allSelected;
        return {
          ...t,
          allSelected: newSelected,
          rows: t.rows.map((r) => ({ ...r, selected: newSelected })),
        };
      })
    );
  };

  const toggleRow = (tableIdx: number, rowId: string) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIdx) return t;
        const newRows = t.rows.map((r) =>
          r.id === rowId ? { ...r, selected: !r.selected } : r
        );
        return {
          ...t,
          rows: newRows,
          allSelected: newRows.every((r) => r.selected),
        };
      })
    );
  };

  const toggleExpand = (tableIdx: number) => {
    setTables((prev) =>
      prev.map((t, i) =>
        i === tableIdx ? { ...t, expanded: !t.expanded } : t
      )
    );
  };

  const updateCell = (
    tableIdx: number,
    rowId: string,
    col: string,
    val: string
  ) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIdx) return t;
        return {
          ...t,
          rows: t.rows.map((r) =>
            r.id === rowId
              ? { ...r, cells: { ...r.cells, [col]: val } }
              : r
          ),
        };
      })
    );
  };

  const removeColumn = (tableIdx: number, col: string) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIdx) return t;
        return {
          ...t,
          columns: t.columns.filter((c) => c !== col),
          rows: t.rows.map((r) => {
            const nextCells = { ...r.cells };
            delete nextCells[col];
            return { ...r, cells: nextCells };
          }),
        };
      })
    );
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    setImportProgress(0);
    try {
      const results = await confirmImportStream(
        tables.map((t) => ({
          name: t.name,
          rows: t.rows,
          columns: t.columns,
        })),
        (event) => {
          if (event.type === "progress") {
            // Prefer fine-grained row progress when available, else table-level.
            if (event.rows_total && event.rows_total > 0) {
              setImportProgress(
                Math.round((event.rows_done ?? 0) / event.rows_total * 100)
              );
            } else if (event.total > 0) {
              setImportProgress(Math.round((event.done / event.total) * 100));
            }
          }
        }
      );

      setImportResults(results as Record<string, TableImportResult>);

      const totalImported = Object.values(results).reduce(
        (s: number, r: any) => s + r.imported,
        0
      );
      const totalErrors = Object.values(results).reduce(
        (s: number, r: any) => s + r.errors.length,
        0
      );

      toast({
        title: "Import complete",
        description: `${totalImported} records imported${
          totalErrors > 0 ? `, ${totalErrors} errors` : ""
        }.`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const totalSelected = tables.reduce(
    (sum, t) => sum + t.rows.filter((r) => r.selected).length,
    0
  );
  const totalRows = tables.reduce((sum, t) => sum + t.rows.length, 0);
  const isProcessing =
    phase === "uploading" ||
    phase === "processing" ||
    phase === "analyzing" ||
    phase === "validating";

  return (
    <div className="space-y-6">
      {/* Drop zone — idle */}
      {phase === "idle" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all duration-300",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
              isDragging ? "bg-primary/10" : "bg-muted"
            )}
          >
            <FileSpreadsheet
              className={cn(
                "w-8 h-8 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>
          <div className="text-center">
            <p className="font-medium">
              {isDragging
                ? "Drop your file here"
                : "Drop a file to import data"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports CSV, Excel, PDF, or any structured document
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" />
            Browse files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,.pdf,.txt,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFilePicked(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Table selection step */}
      {phase === "selecting" && (
        <TableSelectionStep
          selectedTables={selectedTables}
          onToggle={toggleTableSelection}
          onSelectAll={() =>
            setSelectedTables(new Set(SELECTABLE_TABLES.map((t) => t.key)))
          }
          onDeselectAll={() => setSelectedTables(new Set())}
          onConfirm={handleConfirmTableSelection}
          onCancel={handleReset}
          fileName={fileName}
        />
      )}

      {/* Processing / done state */}
      {phase !== "idle" && phase !== "selecting" && (
        <div className="space-y-6">
          {/* File info + cancel */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {phase === "done"
                    ? `${totalRows} records found across ${tables.length} tables`
                    : "Processing..."}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </div>

          {/* Phase indicator */}
          <PhaseIndicator current={phase} />

          {/* Progress bar */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {Math.round(progress)}%
              </p>
            </div>
          )}

          {/* AI thinking log */}
          {(isProcessing || phase === "done") && thinking.length > 0 && (
            <div className="space-y-3">
              {isProcessing && (
                <div className="flex items-center gap-3">
                  <AiSpinner />
                  <div>
                    <p className="text-sm font-medium">
                      AI is analyzing your data
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Identifying entities and mapping to your schema...
                    </p>
                  </div>
                </div>
              )}
              <ThinkingLog lines={thinking} />
            </div>
          )}

          {/* Preview tables */}
          {phase === "done" && tables.length > 0 && !importResults && (
            <div className="space-y-4">
              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Import Preview
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Review and select the data you want to import. Click Edit to
                    modify values inline.
                  </p>
                </div>
                <Badge variant="outline">
                  {totalSelected}/{totalRows} records selected
                </Badge>
              </div>

              <div className="space-y-3">
                {tables.map((table, idx) => (
                  <ImportTableView
                    key={table.name}
                    table={table}
                    onToggleAll={() => toggleAll(idx)}
                    onToggleRow={(rowId) => toggleRow(idx, rowId)}
                    onToggleExpand={() => toggleExpand(idx)}
                    onCellChange={(rowId, col, val) =>
                      updateCell(idx, rowId, col, val)
                    }
                    onRemoveColumn={(col) => removeColumn(idx, col)}
                    groupByCol={GROUP_BY_MAP[table.name]}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    Importing will add records to your existing data.
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={importing}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={totalSelected === 0 || importing}
                    onClick={handleConfirmImport}
                  >
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {importing
                      ? importProgress > 0
                        ? `Importing... ${importProgress}%`
                        : "Importing..."
                      : `Import ${totalSelected} records`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Results view */}
          {importResults && (
            <ImportResultsView
              tables={tables}
              results={importResults}
              onReset={handleReset}
            />
          )}
        </div>
      )}
    </div>
  );
}
