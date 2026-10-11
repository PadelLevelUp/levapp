/**
 * The landing demo dialog's one network call (PAD-617, auth.landing-page rule 10):
 * LevApp's own public endpoint. No token, no shared API client (it carries the
 * session), and no HubSpot host: the server relays the request.
 */

import { API_BASE_URL } from "@/api/client";

export type DemoPedido = "demonstracao" | "mes_gratis";

export interface DemoRequestBody {
  fullname: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  alunos: number;
  horas: number;
  message: string;
  consent: true;
  pedido: DemoPedido;
  hutk?: string;
  pageUri: string;
  pageName: string;
  /** Honeypot: always empty from a person. */
  website: string;
  elapsedMs: number;
}

export type DemoRequestResult =
  | { ok: true }
  | { ok: false; status: number; field?: string; code?: string };

/** Status 0 means the request never got an answer (network error). */
export async function sendDemoRequest(body: DemoRequestBody): Promise<DemoRequestResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/public/demo-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  if (res.ok) return { ok: true };
  let data: { field?: unknown; code?: unknown } = {};
  try {
    data = (await res.json()) ?? {};
  } catch {
    // an error page without JSON: the status alone is the answer
  }
  const out: DemoRequestResult = { ok: false, status: res.status };
  if (res.status === 400 && typeof data.field === "string") out.field = data.field;
  if (typeof data.code === "string" && res.status === 400) out.code = data.code;
  return out;
}
