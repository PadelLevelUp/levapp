import { api, WEB_CAPABILITIES } from "@/api/client";
import { CAPABILITIES_HEADER, LONG_REQUEST_TIMEOUT_MS } from "@levelup/api/src/client";

/* ---------- types ---------- */

/** One row error from the import. `code` is set when the server knows the cause (D111, PAD-403). */
export interface ImportRowError {
  row: number;
  error: string;
  code?: string;
  category?: string;
  value?: number;
}

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
  imported: number;
  errors: ImportRowError[];
}

/* ---------- SSE event types from /analyze ---------- */

export type AnalyzeSSEEvent =
  | { type: "thinking"; text: string }
  | { type: "phase"; phase: string }
  | { type: "progress"; value: number }
  | { type: "tables"; tables: Record<string, Array<Record<string, unknown>>> }
  | { type: "error"; message: string }
  | { type: "done" };

/* ---------- analyze (SSE stream) ---------- */

export async function analyzeFile(
  file: File,
  onEvent: (event: AnalyzeSSEEvent) => void,
  options?: {
    signal?: AbortSignal;
    requestedTables?: string[];
  }
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  // Pass selected tables to backend so it only extracts what's needed
  if (options?.requestedTables && options.requestedTables.length > 0) {
    formData.append("tables", options.requestedTables.join(","));
  }

  // Reuse the same baseURL and auth token the axios client uses
  const baseURL = api.defaults.baseURL || "/api";
  const token = localStorage.getItem("accessToken");

  const response = await fetch(`${baseURL}/app/import/analyze`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    signal: options?.signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("accessToken");
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      window.location.assign(`/auth?next=${next}`);
    }
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
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(trimmed.slice(6)) as AnalyzeSSEEvent);
        } catch {
          /* skip malformed */
        }
      }
    }
  }

  if (buffer.trim().startsWith("data: ")) {
    try {
      onEvent(JSON.parse(buffer.trim().slice(6)) as AnalyzeSSEEvent);
    } catch {
      /* ignore */
    }
  }
}

/* ---------- import history ---------- */

export interface ImportHistoryEntry {
  id: number;
  created_at: string;
  filename: string | null;
  status: "active" | "reverted";
  summary: Record<string, number>;
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  const { data } = await api.get<ImportHistoryEntry[]>("/app/import/history");
  return data;
}

export interface RevertResult {
  deleted: Record<string, number>;
  status: string;
}

export async function revertImport(importId: number): Promise<RevertResult> {
  const { data } = await api.post<RevertResult>(`/app/import/${importId}/revert`, undefined, {
    // client.request-timeout rule 2: a revert deletes every imported row; it may run long.
    timeout: LONG_REQUEST_TIMEOUT_MS,
  });
  return data;
}

/* ---------- confirm import ---------- */

export interface ConfirmPayload {
  [tableName: string]: Array<Record<string, string>>;
}

export type ConfirmResult = Record<string, ImportResult>;

/** PAD-642 (import.confirm rule 9): the coach's "every imported student is 18 or older". */
export interface ConfirmOptions {
  confirmsAdults?: boolean;
}

export async function confirmImport(
  tables: ImportTable[],
  options: ConfirmOptions = {}
): Promise<ConfirmResult> {
  const payload: Record<string, unknown> = options.confirmsAdults ? { confirmsAdults: true } : {};
  for (const table of tables) {
    const selected = table.rows.filter((r) => r.selected);
    if (selected.length === 0) continue;
    payload[table.name] = selected.map((r) => r.cells);
  }
  const { data } = await api.post<ConfirmResult>("/app/import/confirm", payload, {
    // client.request-timeout rule 2: a large import is written in one request; it may run long.
    timeout: LONG_REQUEST_TIMEOUT_MS,
  });
  return data;
}

/* ---------- confirm import (SSE stream) ---------- */

export type ConfirmSSEEvent =
  | {
      type: "progress";
      table: string | null;
      done: number;
      total: number;
      rows_done?: number;
      rows_total?: number;
    }
  | { type: "done"; results: ConfirmResult }
  | { type: "error"; message: string };

/**
 * Stream a bulk import via SSE. The backend keeps the connection alive with
 * progress events so the front gateway never returns a false 504 on large
 * uploads. Resolves with the final results dict (same shape as confirmImport).
 */
export async function confirmImportStream(
  tables: ImportTable[],
  onEvent?: (event: ConfirmSSEEvent) => void,
  options: ConfirmOptions = {}
): Promise<ConfirmResult> {
  const payload: Record<string, unknown> = options.confirmsAdults ? { confirmsAdults: true } : {};
  for (const table of tables) {
    const selected = table.rows.filter((r) => r.selected);
    if (selected.length === 0) continue;
    payload[table.name] = selected.map((r) => r.cells);
  }

  const baseURL = api.defaults.baseURL || "/api";
  const token = localStorage.getItem("accessToken");

  const response = await fetch(`${baseURL}/app/import/confirm/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // PAD-642: this fetch bypasses the axios client, so it declares the shell's capabilities itself.
      [CAPABILITIES_HEADER]: WEB_CAPABILITIES.join(", "),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("accessToken");
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      window.location.assign(`/auth?next=${next}`);
    }
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Import failed (${response.status}): ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let results: ConfirmResult = {};
  let streamError: string | null = null;

  const parse = (raw: string): ConfirmSSEEvent | null => {
    try {
      return JSON.parse(raw) as ConfirmSSEEvent;
    } catch {
      return null; // skip malformed
    }
  };

  const handle = (event: ConfirmSSEEvent) => {
    onEvent?.(event);
    if (event.type === "done") results = event.results;
    if (event.type === "error") streamError = event.message;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("data: ")) {
        const event = parse(trimmed.slice(6));
        if (event) handle(event);
      }
    }
  }

  if (buffer.trim().startsWith("data: ")) {
    const event = parse(buffer.trim().slice(6));
    if (event) handle(event);
  }

  if (streamError) throw new Error(streamError);
  return results;
}
