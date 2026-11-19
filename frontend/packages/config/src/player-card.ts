/**
 * players.profile rules 8, 9, 11 (PAD-834): the player card's Block 1 (Informação) and its state
 * alerts, as pure rules both shells share. The components only render what these say.
 */

export type InfoSide = "left" | "right" | "both";

/** How Block 1's edit was opened: its own Editar, or "Completar informação" (rule 9). */
export type InfoEditSession = "edit" | "complete";

export interface InfoDraft {
  email: string;
  phone: string;
  levelId: string;
  side: InfoSide | "";
  notes: string;
}

export interface InfoSource {
  email?: string | null;
  phone?: string | null;
  levelId?: string | number | null;
  side?: InfoSide | null;
  notes?: string | null;
  pendingRegistration?: boolean;
}

export function infoDraftOf(p: InfoSource): InfoDraft {
  return {
    email: p.email ?? "",
    phone: p.phone ?? "",
    levelId: p.levelId != null ? String(p.levelId) : "",
    side: p.side ?? "",
    notes: p.notes ?? "",
  };
}

/** What a player of `const:NEEDS_CONFIGURING` is missing, in the alert's order. */
export function missingSetup(p: InfoSource): Array<"level" | "side"> {
  const missing: Array<"level" | "side"> = [];
  if (p.levelId == null || p.levelId === "") missing.push("level");
  if (!p.side) missing.push("side");
  return missing;
}

/** The i18n key that names what is missing ("Falta definir: …"), or null when nothing is. */
export function missingSetupKey(missing: Array<"level" | "side">): string | null {
  if (missing.length === 2) return "players.card.missingBoth";
  if (missing[0] === "level") return "players.card.missingLevel";
  if (missing[0] === "side") return "players.card.missingSide";
  return null;
}

/**
 * Rule 8: a select is required only when it has options. Lado always has them; Nível only
 * when the coach has at least one level (a coach may have none).
 */
export function infoRequired(hasLevels: boolean): { level: boolean; side: boolean } {
  return { level: hasLevels, side: true };
}

/**
 * Rule 8: Guardar waits for an empty required select only in the session opened by
 * "Completar informação"; a plain Editar never blocks on an untouched empty select.
 */
export function infoCanSave(args: {
  session: InfoEditSession;
  hasLevels: boolean;
  draft: InfoDraft;
  saving?: boolean;
}): boolean {
  if (args.saving) return false;
  if (args.session !== "complete") return true;
  const required = infoRequired(args.hasLevels);
  if (required.level && !args.draft.levelId) return false;
  if (required.side && !args.draft.side) return false;
  return true;
}

/**
 * Rule 8: the e-mail is the coach's to edit only for a player of `const:PENDING_REGISTRATION`;
 * for anyone else it is their login (a Google/Apple student included).
 */
export function infoEmailEditable(p: InfoSource): boolean {
  return p.pendingRegistration === true;
}

/**
 * Rule 8: the keys Guardar sends — only those that changed. An emptied e-mail, phone or note is
 * sent as null (the server clears it); level and side have no empty option, so an empty one is
 * never sent.
 */
export function infoChanges(original: InfoSource, draft: InfoDraft): Record<string, string | null> {
  const before = infoDraftOf(original);
  const out: Record<string, string | null> = {};
  const text = (key: "email" | "phone" | "notes") => {
    const next = draft[key].trim();
    if (next !== before[key].trim()) out[key] = next || null;
  };
  if (infoEmailEditable(original)) text("email");
  text("phone");
  text("notes");
  if (draft.levelId && draft.levelId !== before.levelId) out.levelId = draft.levelId;
  if (draft.side && draft.side !== before.side) out.side = draft.side;
  return out;
}
