/**
 * The landing contact dialog's one network call (PAD-617, PAD-650; auth.landing-page rule 10):
 * LevApp's own public endpoint. No token, no shared API client (it carries the
 * session), and no HubSpot host: the server relays the request.
 */

import { API_BASE_URL } from "@/api/base";

export type DemoPedido = "demonstracao" | "mes_gratis";

/** The qualification questions' internal values, exactly the CRM's options (PAD-650). The screen
 * shows labels; only these values are sent. */
export const GESTAO_VALUES = [
  "ferramentas_classicas",
  "clube_outro_treinador",
  "ninguem_trata",
  "outro",
] as const;
export const LEMBRETES_VALUES = ["diariamente", "semanalmente", "nao_envia"] as const;
export const TEMPO_VALUES = ["menos_1h", "1_3h", "mais_3h"] as const;

export interface DemoRequestBody {
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
  clube: string;
  gestao: string[];
  lembretes: string;
  tempo: string;
  consent: true;
  marketing: boolean;
  /** Only from a demo button; "Falar connosco" sends none. */
  pedido?: DemoPedido;
  /** Which consent text the visitor saw; the server sends that one to HubSpot. */
  lang: "pt" | "en";
  /** Only with the visitor's cookie consent. */
  hutk?: string;
  pageUri: string;
  pageName: string;
  /** Honeypot: always empty from a person. */
  website: string;
  elapsedMs: number;
}

/**
 * A Portuguese mobile as `+351 9XX XXX XXX`; another country's number (leading `+` other than
 * `+351`, 8–15 digits) as typed; anything else is `null`. The server (`demo_request_service.normalise_phone`) does the
 * same, so a number the form accepts is never a 400.
 */
export function normalisePhone(raw: string): string | null {
  const typed = raw.trim();
  const compact = typed.replace(/[\s\-.()]/g, "");
  const pt = compact.match(/^(?:\+351|00351)?(9\d{8})$/);
  if (pt) {
    const n = pt[1];
    return `+351 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  // Another country's number; a +351 number that is not a mobile is refused (the field is "Telemóvel").
  if (/^\+\d{8,15}$/.test(compact) && !compact.startsWith("+351") && typed.length <= 40) return typed;
  return null;
}

/** One shape (the web tsconfig is not strict, so a union would not narrow): `status`, `field` and
 * `code` are set when `ok` is false. */
export interface DemoRequestResult {
  ok: boolean;
  status?: number;
  field?: string;
  code?: string;
}

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
