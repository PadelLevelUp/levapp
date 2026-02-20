import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { addCoachLevel } from "@/api/coachLevel";
import { addEvaluationCategories, postEvaluationEntry } from "@/api/evaluation";
import { addPlayer } from "@/api/players";
import { addClass } from "@/api/classes";

interface ImportTableRow {
  id: string;
  cells: Record<string, string>;
  selected: boolean;
}

interface ImportTable {
  name: string;
  columns?: string[];
  rows: ImportTableRow[];
}

interface ImportResult {
  tableName: string;
  imported: number;
  errors: string[];
}

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function getDayNumber(day: string): number {
  return DAY_MAP[day.toLowerCase()] ?? 1;
}

async function importLevels(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Levels", imported: 0, errors: [] };
  for (const row of rows.filter((r) => r.selected)) {
    try {
      await addCoachLevel({
        code: row.cells["Code"] || "",
        label: row.cells["Label"] || "",
        displayOrder: parseInt(row.cells["Order"] || "0", 10),
      });
      result.imported++;
    } catch (e: any) {
      result.errors.push(`Level "${row.cells["Code"]}": ${e.message}`);
    }
  }
  return result;
}

async function importEvaluationCategories(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Evaluation Categories", imported: 0, errors: [] };
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) return result;

  try {
    const payload = selected.map((row) => ({
      name: row.cells["Name"] || "",
      scaleMin: parseInt(row.cells["Scale Min"] || "1", 10),
      scaleMax: parseInt(row.cells["Scale Max"] || "10", 10),
    }));
    await addEvaluationCategories(payload);
    result.imported = selected.length;
  } catch (e: any) {
    result.errors.push(`Categories batch: ${e.message}`);
  }
  return result;
}

async function importPlayers(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Players", imported: 0, errors: [] };
  for (const row of rows.filter((r) => r.selected)) {
    try {
      await addPlayer({
        name: row.cells["Name"] || "",
        email: row.cells["Email"] || "",
        phone: row.cells["Phone"] || "",
        levelCode: row.cells["Level"] || "",
        side: (row.cells["Side"] || "").toLowerCase() as "left" | "right",
      });
      result.imported++;
    } catch (e: any) {
      result.errors.push(`Player "${row.cells["Name"]}": ${e.message}`);
    }
  }
  return result;
}

async function importClasses(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Classes", imported: 0, errors: [] };
  for (const row of rows.filter((r) => r.selected)) {
    try {
      const isRecurring = (row.cells["Recurring"] || "").toLowerCase() === "yes";
      const dayNum = getDayNumber(row.cells["Day"] || "Monday");

      await addClass({
        classType: row.cells["Type"] || "academy",
        name: row.cells["Name"] || "",
        isRecurring,
        date: new Date().toISOString().split("T")[0],
        startTime: row.cells["Start"] || "09:00",
        endTime: row.cells["End"] || "10:30",
        maxPlayers: parseInt(row.cells["Max Players"] || "4", 10),
        recurrenceRule: isRecurring ? { frequency: "weekly", daysOfWeek: [dayNum] } : null,
      });
      result.imported++;
    } catch (e: any) {
      result.errors.push(`Class "${row.cells["Name"]}": ${e.message}`);
    }
  }
  return result;
}

async function importPlayersInClasses(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Players in Classes", imported: 0, errors: [] };
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) return result;

  if (USE_MOCK_DATA) {
    console.log("[mock] importPlayersInClasses", selected.map((r) => r.cells));
    result.imported = selected.length;
    return result;
  }

  try {
    await api.post("/app/import/class_participants", {
      entries: selected.map((r) => ({
        className: r.cells["Class"] || "",
        playerName: r.cells["Player"] || "",
      })),
    });
    result.imported = selected.length;
  } catch (e: any) {
    result.errors.push(`Class participants: ${e.message}`);
  }
  return result;
}

async function importPresences(rows: ImportTableRow[]): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Presences", imported: 0, errors: [] };
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) return result;

  if (USE_MOCK_DATA) {
    console.log("[mock] importPresences", selected.map((r) => r.cells));
    result.imported = selected.length;
    return result;
  }

  try {
    await api.post("/app/import/presences", {
      entries: selected.map((r) => ({
        className: r.cells["Class"] || "",
        date: r.cells["Date"] || "",
        playerName: r.cells["Player"] || "",
        status: (r.cells["Status"] || "present").toLowerCase(),
        justification: (r.cells["Justification"] || "").toLowerCase() || null,
      })),
    });
    result.imported = selected.length;
  } catch (e: any) {
    result.errors.push(`Presences: ${e.message}`);
  }
  return result;
}

async function importPlayerEvaluations(
  rows: ImportTableRow[],
  columns: string[]
): Promise<ImportResult> {
  const result: ImportResult = { tableName: "Player Evaluations", imported: 0, errors: [] };
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) return result;

  // Category columns are everything except "Player" and "Date"
  const categoryColumns = columns.filter((c) => c !== "Player" && c !== "Date");

  if (USE_MOCK_DATA) {
    console.log("[mock] importPlayerEvaluations", selected.map((r) => r.cells));
    result.imported = selected.length;
    return result;
  }

  try {
    await api.post("/app/import/player_evaluations", {
      entries: selected.map((r) => ({
        playerName: r.cells["Player"] || "",
        date: r.cells["Date"] || "",
        scores: categoryColumns.reduce((acc, cat) => {
          const val = r.cells[cat];
          if (val) acc[cat] = parseInt(val, 10);
          return acc;
        }, {} as Record<string, number>),
      })),
    });
    result.imported = selected.length;
  } catch (e: any) {
    result.errors.push(`Evaluations: ${e.message}`);
  }
  return result;
}

/** Import all selected records across all tables, in order. */
export async function importAllData(
  tables: ImportTable[],
  onProgress?: (tableName: string, result: ImportResult) => void
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  const tableMap = new Map(tables.map((t) => [t.name, t]));

  const importers: { name: string; fn: () => Promise<ImportResult> }[] = [
    { name: "Levels", fn: () => importLevels(tableMap.get("Levels")?.rows || []) },
    { name: "Evaluation Categories", fn: () => importEvaluationCategories(tableMap.get("Evaluation Categories")?.rows || []) },
    { name: "Players", fn: () => importPlayers(tableMap.get("Players")?.rows || []) },
    { name: "Classes", fn: () => importClasses(tableMap.get("Classes")?.rows || []) },
    { name: "Players in Classes", fn: () => importPlayersInClasses(tableMap.get("Players in Classes")?.rows || []) },
    { name: "Presences", fn: () => importPresences(tableMap.get("Presences")?.rows || []) },
    {
      name: "Player Evaluations",
      fn: () => {
        const t = tableMap.get("Player Evaluations");
        return importPlayerEvaluations(t?.rows || [], (t as any)?.columns || []);
      },
    },
  ];

  for (const importer of importers) {
    const table = tableMap.get(importer.name);
    if (!table || table.rows.filter((r) => r.selected).length === 0) continue;

    const result = await importer.fn();
    results.push(result);
    onProgress?.(importer.name, result);
  }

  return results;
}
