import { api } from "@/api/client";

/* ---------- types ---------- */

export interface ImportTableRow {
  id: string;
  cells: Record<string, string>;
  selected: boolean;
}

export interface ImportTable {
  name: string;
  columns?: string[];
  rows: ImportTableRow[];
}

export interface ImportResult {
  tableName: string;
  imported: number;
  errors: string[];
}

/* ---------- SSE event types from /analyze ---------- */

export type AnalyzeSSEEvent =
  | { type: "thinking"; text: string }
  | { type: "phase"; phase: string }
  | { type: "progress"; value: number }
  | { type: "tables"; tables: ImportTable[] }
  | { type: "error"; message: string }
  | { type: "done" };

/* ---------- analyze (SSE stream) ---------- */

export async function analyzeFile(
  file: File,
  onEvent: (event: AnalyzeSSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  const token = localStorage.getItem("accessToken");

  const response = await fetch("/api/app/import/analyze", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Analyze failed (${response.status}): ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue; // skip comments/keep-alive

      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.slice(6);
        try {
          const event = JSON.parse(jsonStr) as AnalyzeSSEEvent;
          onEvent(event);
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    try {
      const event = JSON.parse(buffer.trim().slice(6)) as AnalyzeSSEEvent;
      onEvent(event);
    } catch {
      // ignore
    }
  }
}

/* ---------- confirm import ---------- */

export interface ConfirmPayload {
  [tableName: string]: Array<Record<string, string>>;
}

export interface ConfirmResult {
  results: ImportResult[];
}

export async function confirmImport(
  tables: ImportTable[]
): Promise<ConfirmResult> {
  // Build payload: only selected rows, mapped by table name
  const payload: ConfirmPayload = {};
  for (const table of tables) {
    const selected = table.rows.filter((r) => r.selected);
    if (selected.length === 0) continue;
    payload[table.name] = selected.map((r) => r.cells);
  }

  const { data } = await api.post<ConfirmResult>("/app/import/confirm", payload);
  return data;
}
