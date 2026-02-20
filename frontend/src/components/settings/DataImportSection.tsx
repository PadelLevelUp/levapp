import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";

/* ---------- types ---------- */

type Phase = "idle" | "uploading" | "processing" | "analyzing" | "done";

interface ThinkingLine {
  text: string;
  done: boolean;
}

interface ImportTableRow {
  id: string;
  cells: Record<string, string>;
  selected: boolean;
}

interface ImportTable {
  name: string;
  icon: string;
  columns: string[];
  rows: ImportTableRow[];
  allSelected: boolean;
  expanded: boolean;
}

/* ---------- mock data generator ---------- */

function generateMockResults(): ImportTable[] {
  return [
    {
      name: "Levels",
      icon: "🏷️",
      columns: ["Code", "Label", "Order"],
      allSelected: true,
      expanded: false,
      rows: [
        { id: "l1", cells: { Code: "INI", Label: "Initiation", Order: "1" }, selected: true },
        { id: "l2", cells: { Code: "INT", Label: "Intermediate", Order: "2" }, selected: true },
        { id: "l3", cells: { Code: "ADV", Label: "Advanced", Order: "3" }, selected: true },
        { id: "l4", cells: { Code: "PRO", Label: "Professional", Order: "4" }, selected: true },
      ],
    },
    {
      name: "Evaluation Categories",
      icon: "📊",
      columns: ["Name", "Scale Min", "Scale Max"],
      allSelected: true,
      expanded: false,
      rows: [
        { id: "ec1", cells: { Name: "Forehand", "Scale Min": "1", "Scale Max": "10" }, selected: true },
        { id: "ec2", cells: { Name: "Backhand", "Scale Min": "1", "Scale Max": "10" }, selected: true },
        { id: "ec3", cells: { Name: "Serve", "Scale Min": "1", "Scale Max": "10" }, selected: true },
        { id: "ec4", cells: { Name: "Volley", "Scale Min": "1", "Scale Max": "10" }, selected: true },
        { id: "ec5", cells: { Name: "Positioning", "Scale Min": "1", "Scale Max": "10" }, selected: true },
      ],
    },
    {
      name: "Players",
      icon: "🎾",
      columns: ["Name", "Email", "Phone", "Level", "Side"],
      allSelected: true,
      expanded: false,
      rows: [
        { id: "p1", cells: { Name: "Ana Rodrigues", Email: "ana@email.com", Phone: "+351 912 345 678", Level: "INT", Side: "Right" }, selected: true },
        { id: "p2", cells: { Name: "Carlos Silva", Email: "carlos@email.com", Phone: "+351 923 456 789", Level: "ADV", Side: "Left" }, selected: true },
        { id: "p3", cells: { Name: "Maria Santos", Email: "maria@email.com", Phone: "+351 934 567 890", Level: "INI", Side: "Right" }, selected: true },
        { id: "p4", cells: { Name: "João Costa", Email: "joao@email.com", Phone: "+351 945 678 901", Level: "PRO", Side: "Left" }, selected: true },
        { id: "p5", cells: { Name: "Sofia Mendes", Email: "sofia@email.com", Phone: "", Level: "INT", Side: "Right" }, selected: true },
      ],
    },
    {
      name: "Classes",
      icon: "📅",
      columns: ["Name", "Type", "Day", "Start", "End", "Max Players"],
      allSelected: true,
      expanded: false,
      rows: [
        { id: "c1", cells: { Name: "Morning Academy", Type: "academy", Day: "Monday", Start: "09:00", End: "10:30", "Max Players": "4" }, selected: true },
        { id: "c2", cells: { Name: "Evening Private", Type: "private", Day: "Tuesday", Start: "18:00", End: "19:00", "Max Players": "2" }, selected: true },
        { id: "c3", cells: { Name: "Weekend Group", Type: "academy", Day: "Saturday", Start: "10:00", End: "11:30", "Max Players": "6" }, selected: true },
      ],
    },
    {
      name: "Player Evaluations",
      icon: "📝",
      columns: ["Player", "Category", "Score", "Date"],
      allSelected: true,
      expanded: false,
      rows: [
        { id: "pe1", cells: { Player: "Ana Rodrigues", Category: "Forehand", Score: "7", Date: "2025-01-15" }, selected: true },
        { id: "pe2", cells: { Player: "Ana Rodrigues", Category: "Backhand", Score: "6", Date: "2025-01-15" }, selected: true },
        { id: "pe3", cells: { Player: "Carlos Silva", Category: "Serve", Score: "8", Date: "2025-01-20" }, selected: true },
        { id: "pe4", cells: { Player: "Carlos Silva", Category: "Volley", Score: "9", Date: "2025-01-20" }, selected: true },
        { id: "pe5", cells: { Player: "Maria Santos", Category: "Positioning", Score: "5", Date: "2025-02-01" }, selected: true },
        { id: "pe6", cells: { Player: "João Costa", Category: "Forehand", Score: "9", Date: "2025-02-05" }, selected: true },
      ],
    },
  ];
}

/* ---------- thinking lines per phase ---------- */

const thinkingSequences: Record<string, string[]> = {
  uploading: [
    "Receiving file...",
    "Validating file format...",
    "File uploaded successfully.",
  ],
  processing: [
    "Parsing document structure...",
    "Extracting raw text content...",
    "Identifying tables and sections...",
    "Normalizing data formats...",
    "Building structured representation...",
  ],
  analyzing: [
    "Sending data to AI model...",
    "Identifying entity types...",
    "Mapping fields to schema: Levels, Players, Classes...",
    "Cross-referencing player names with evaluations...",
    "Resolving ambiguous categories...",
    "Validating data integrity...",
    "Generating import preview...",
  ],
};

/* ---------- AI spinner ---------- */

function AiSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Outer ring */}
      <div className="absolute w-12 h-12 rounded-full border-2 border-primary/20 animate-ping" />
      {/* Middle ring */}
      <div className="absolute w-10 h-10 rounded-full border-2 border-t-primary border-r-primary/40 border-b-primary/10 border-l-primary/40 animate-spin" />
      {/* Inner icon */}
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

function PhaseIndicator({ current }: { current: Phase }) {
  const phaseOrder: Phase[] = ["uploading", "processing", "analyzing", "done"];
  const currentIdx = phaseOrder.indexOf(current);

  return (
    <div className="flex items-center gap-2">
      {phaseConfig.map((p, i) => {
        const idx = phaseOrder.indexOf(p.key);
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
                isActive && "bg-primary text-primary-foreground shadow-md shadow-primary/25",
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

/* ---------- import table ---------- */

function ImportTableView({
  table,
  onToggleAll,
  onToggleRow,
  onToggleExpand,
}: {
  table: ImportTable;
  onToggleAll: () => void;
  onToggleRow: (rowId: string) => void;
  onToggleExpand: () => void;
}) {
  const selectedCount = table.rows.filter((r) => r.selected).length;

  return (
    <div className="rounded-lg border overflow-hidden animate-fade-in">
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{table.icon}</span>
          <span className="font-medium text-sm">{table.name}</span>
          <Badge variant="secondary" className="text-xs">
            {selectedCount}/{table.rows.length} selected
          </Badge>
        </div>
        <div className="flex items-center gap-2">
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
      </button>

      {/* Table body */}
      {table.expanded && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                {table.columns.map((col) => (
                  <TableHead key={col} className="text-xs">
                    {col}
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
                    <TableCell key={col} className="text-xs">
                      {row.cells[col] || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ---------- main component ---------- */

export function DataImportSection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [thinking, setThinking] = useState<ThinkingLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [tables, setTables] = useState<ImportTable[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- simulate a phase with thinking lines ---- */
  const runPhase = useCallback(
    (phaseName: "uploading" | "processing" | "analyzing"): Promise<void> => {
      return new Promise((resolve) => {
        const lines = thinkingSequences[phaseName];
        let i = 0;

        const interval = setInterval(() => {
          if (i > 0) {
            // Mark previous line as done
            setThinking((prev) =>
              prev.map((l, idx) => (idx === prev.length - 1 ? { ...l, done: true } : l))
            );
          }

          if (i < lines.length) {
            setThinking((prev) => [...prev, { text: lines[i], done: false }]);
            // Update progress
            const phaseOffsets = { uploading: 0, processing: 20, analyzing: 50 };
            const phaseWeights = { uploading: 20, processing: 30, analyzing: 50 };
            const pct =
              phaseOffsets[phaseName] +
              ((i + 1) / lines.length) * phaseWeights[phaseName];
            setProgress(Math.min(pct, 100));
            i++;
          } else {
            clearInterval(interval);
            resolve();
          }
        }, 600 + Math.random() * 400);
      });
    },
    []
  );

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setThinking([]);
      setProgress(0);
      setTables([]);

      setPhase("uploading");
      await runPhase("uploading");

      setPhase("processing");
      await runPhase("processing");

      setPhase("analyzing");
      await runPhase("analyzing");

      // Mark last line done
      setThinking((prev) =>
        prev.map((l, idx) => (idx === prev.length - 1 ? { ...l, done: true } : l))
      );
      setProgress(100);

      // Generate results
      setTables(generateMockResults());
      setPhase("done");
    },
    [runPhase]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleReset = () => {
    setPhase("idle");
    setFileName("");
    setThinking([]);
    setProgress(0);
    setTables([]);
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

  const totalSelected = tables.reduce(
    (sum, t) => sum + t.rows.filter((r) => r.selected).length,
    0
  );
  const totalRows = tables.reduce((sum, t) => sum + t.rows.length, 0);

  const isProcessing = phase === "uploading" || phase === "processing" || phase === "analyzing";

  return (
    <div className="space-y-6">
      {/* Drop zone — idle state */}
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
              {isDragging ? "Drop your file here" : "Drop a file to import data"}
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
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Processing / done state */}
      {phase !== "idle" && (
        <div className="space-y-6">
          {/* File info + reset */}
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
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
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

          {/* AI thinking / processing area */}
          {(isProcessing || phase === "done") && thinking.length > 0 && (
            <div className="space-y-3">
              {isProcessing && (
                <div className="flex items-center gap-3">
                  <AiSpinner />
                  <div>
                    <p className="text-sm font-medium">AI is analyzing your data</p>
                    <p className="text-xs text-muted-foreground">
                      Identifying entities and mapping to your schema...
                    </p>
                  </div>
                </div>
              )}
              <ThinkingLog lines={thinking} />
            </div>
          )}

          {/* Results tables */}
          {phase === "done" && tables.length > 0 && (
            <div className="space-y-4">
              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Import Preview
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Review and select the data you want to import. Click a table to expand it.
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
                  />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>Importing will add records to your existing data.</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleReset}>
                    Cancel
                  </Button>
                  <Button className="gap-2" disabled={totalSelected === 0}>
                    <Upload className="w-4 h-4" />
                    Import {totalSelected} records
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
