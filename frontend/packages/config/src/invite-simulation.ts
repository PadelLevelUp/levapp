import type {
  EligibilityFailure,
  InviteExplain,
  InviteSendStatus,
  InviteSimulationGate,
  InviteSimulationPriority,
  InviteSimulationRule,
  InviteSimulationSpot,
} from "@levelup/types";

/**
 * PAD-196 — settings.tutorials rules 4–6.
 *
 * The backend emits STRUCTURED codes only (notifications.invite-simulation
 * rule 12; the PAD-133 precedent): gate codes, stage names, failure records,
 * priority values. Turning those into sentences is a client concern, and the
 * two shells must say the same thing about the same student — so the mapping
 * from record to i18n key lives here, once, platform-neutral, and each shell
 * only calls `t(key, params)`.
 *
 * Every function returns `{ key, params }` (or a list of them). Keys point
 * into the `tutorials` locale namespace (`src/locales/{pt,en}/tutorials.json`).
 */
export interface I18nText {
  key: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

const NS = "tutorials";

/** Club wall-clock "HH:MM" for a naive-UTC ISO instant from the backend. */
export function formatClubTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Lisbon",
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/**
 * PAD-517 (settings.tutorials rule 3a): a calendar day ("yyyy-MM-dd") as the short weekday and
 * "dd/mm" in the user's language — `{ weekday: "Qua", day: "14/10" }` / `{ weekday: "Wed", ... }` —
 * for the tutorial's class list. Pure date arithmetic on the day itself: no time zone can move it.
 */
// A fixed table, not Intl: ICU's short weekday differs by runtime ("Quarta" on Node, other forms
// on Hermes), and web and iOS must say the same thing. Sunday first, as Date.getUTCDay counts.
const SHORT_WEEKDAYS = {
  pt: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
} as const;

export function classDayParts(date: string, language: string | undefined): { weekday: string; day: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return { weekday: "", day: date ?? "" };
  const [, y, mo, d] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  const table = (language ?? "pt").startsWith("en") ? SHORT_WEEKDAYS.en : SHORT_WEEKDAYS.pt;
  return { weekday: table[dow], day: `${d}/${mo}` };
}

/** Club-local "DD/MM HH:MM" for a naive-UTC ISO instant. */
export function formatClubDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    // en-GB renders "15/07, 16:00"; the comma is noise in a sentence.
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Lisbon",
    })
      .format(date)
      .replace(",", "");
  } catch {
    return date.toISOString().slice(5, 16).replace("T", " ");
  }
}

// ---------------------------------------------------------------------------
// Eligibility failures (PAD-133 records) — the ONE renderer both shells use
// ---------------------------------------------------------------------------

export function describeEligibilityFailure(f: EligibilityFailure): I18nText {
  const params = {
    actual: f.actual ?? "",
    threshold: f.threshold ?? "",
  };
  if (f.attribute === "level") {
    if (f.reason === "class_has_no_level") return { key: `${NS}.eligibility.classHasNoLevel` };
    if (f.reason === "student_has_no_level") return { key: `${NS}.eligibility.studentHasNoLevel` };
    if (f.reason === "level_not_in_ladder") return { key: `${NS}.eligibility.levelNotInLadder` };
    if (f.reason === "unknown_operation") return { key: `${NS}.eligibility.unknownOperation` };
    const distance = f.ladder_distance;
    if (typeof distance === "number" && distance !== 0) {
      // Positive = weaker than the class (a higher ladder index) = "below".
      const n = Math.abs(distance);
      const direction = distance > 0 ? "levelBelow" : "levelAbove";
      return { key: `${NS}.eligibility.${direction}${n === 1 ? "One" : ""}`, params: { n } };
    }
    return { key: `${NS}.eligibility.levelNotSame`, params };
  }
  if (f.attribute === "unjustified_absences") {
    return { key: `${NS}.eligibility.absencesOver`, params };
  }
  if (f.attribute === "justified_absences") {
    return { key: `${NS}.eligibility.justifiedAbsences`, params };
  }
  if (f.attribute === "attendance_rate") {
    return { key: `${NS}.eligibility.attendanceUnder`, params };
  }
  if (f.attribute === "side") {
    return { key: `${NS}.eligibility.sideMismatch`, params };
  }
  if (f.attribute === "has_makeups") {
    return { key: `${NS}.eligibility.noMakeups` };
  }
  if (f.attribute === "subscription_status") {
    return { key: `${NS}.eligibility.subscription`, params };
  }
  return { key: `${NS}.eligibility.generic`, params: { attribute: f.attribute } };
}

// ---------------------------------------------------------------------------
// Gates, stages, rounds, badges, priorities
// ---------------------------------------------------------------------------

export function describeGate(g: InviteSimulationGate): I18nText {
  return {
    key: `${NS}.gates.${g.code}`,
    params: {
      until: g.until ?? "",
      opensAt: formatClubDateTime(g.opensAt),
      minutes: g.minutes ?? "",
      sent: g.sent ?? 0,
      limit: g.limit ?? "",
    },
  };
}

/** Blocked gates first, in the engine's own order otherwise. */
export function sortGates(gates: InviteSimulationGate[]): InviteSimulationGate[] {
  return [...gates].sort((a, b) => Number(b.blocked) - Number(a.blocked));
}

/** Every stage this build has words for; a stage a newer server adds falls back to a generic line
 * rather than showing its raw i18n key (PAD-497: builds before it show the raw key). */
const KNOWN_STAGES: ReadonlySet<string> = new Set<InviteExplain["stage"]>([
  "departing_player", "already_enrolled", "declined_this_class", "already_invited", "eligibility",
  "excluded_by_coach", "inactive_account", "has_class_same_day", "unavailable", "auto_invites_off", "no_round_matched",
  "offered_another_spot", "invited",
]);

export function describeStage(stage: InviteExplain["stage"]): I18nText {
  return { key: `${NS}.stages.${KNOWN_STAGES.has(stage) ? stage : "unknown"}` };
}

/** A round's criteria in words; an empty rule set means "everyone eligible". */
export function describeRules(rules: InviteSimulationRule[]): I18nText[] {
  if (!rules.length) return [{ key: `${NS}.rounds.everyone` }];
  return rules.map((r) => ({
    key: `${NS}.rules.${r.attribute}.${r.operation}`,
    params: { value: r.value ?? "" },
  }));
}

/**
 * PAD-566 (settings.tutorials rule 4.4): why the spot asks for its side, in the engine's own
 * numbers (`spot.sideCounts`, notifications.invite-simulation rule 9). Nothing is recounted or
 * re-decided here: `chosen` is the engine's side, the counts are its counts — the words only say
 * which case they make. No counts (the roster has no left/right player) has its own line.
 */
export function describeSideReasoning(spot: Pick<InviteSimulationSpot, "sideCounts">): I18nText {
  const counts = spot.sideCounts;
  if (!counts) return { key: `${NS}.sideReason.noSides` };
  const params = { left: counts.left, right: counts.right };
  if (counts.chosen !== "left" && counts.chosen !== "right") {
    // `both` or no side: the spot accepts any side, whatever the counts.
    return { key: `${NS}.sideReason.balancedAny`, params };
  }
  const kind = counts.left === counts.right ? "tie" : "fewer";
  return { key: `${NS}.sideReason.${kind}.${counts.chosen}`, params };
}

export function describeSendStatus(status: InviteSendStatus): I18nText {
  return { key: `${NS}.sendStatus.${status}` };
}

export function describePriority(p: InviteSimulationPriority): I18nText {
  switch (p.id) {
    case "level": {
      if (p.ladderDistance === null || p.ladderDistance === undefined) {
        return { key: `${NS}.priority.levelUnknown` };
      }
      if (p.ladderDistance === 0) return { key: `${NS}.priority.levelSame` };
      const n = Math.abs(p.ladderDistance);
      return {
        key: `${NS}.priority.${p.ladderDistance > 0 ? "levelBelow" : "levelAbove"}`,
        params: { n },
      };
    }
    case "justified_misses":
      return { key: `${NS}.priority.justifiedMisses`, params: { pct: Math.round(p.rate * 100) } };
    case "attendance":
      return { key: `${NS}.priority.attendance`, params: { pct: Math.round(p.rate * 100) } };
    case "playing_side":
      return { key: `${NS}.priority.playingSide.${p.match}` };
    case "subscription_status":
      return { key: `${NS}.priority.subscription.${p.active ? "active" : "inactive"}` };
    default:
      return { key: `${NS}.priority.unknown` };
  }
}

/**
 * Render an `I18nText` with a shell's `t`. Any param whose name ends in `Key`
 * is itself a translation key: it is translated first and handed back under
 * the name without the suffix (`statusKey` → `status`), so nested sentences
 * ("Invited in round 1, position 3 — waiting") stay one locale entry.
 */
export function resolveText(
  t: (key: string, params?: Record<string, unknown>) => string,
  text: I18nText,
): string {
  const entries = Object.entries(text.params ?? {});
  const params: Record<string, unknown> = {};
  for (const [name, value] of entries) {
    if (!name.endsWith("Key")) params[name] = value;
  }
  // Nested keys are translated with the plain params already in place, so a
  // reason such as "{{n}} levels below" inside a round line still gets `n`.
  for (const [name, value] of entries) {
    if (name.endsWith("Key") && typeof value === "string") {
      params[name.slice(0, -3)] = t(value, params);
    }
  }
  return t(text.key, params);
}

// ---------------------------------------------------------------------------
// The lookup verdict
// ---------------------------------------------------------------------------

export interface VerdictText {
  /** The one sentence for the stage */
  headline: I18nText;
  /** Extra lines: the failed rules (eligibility) or per-round failures */
  reasons: I18nText[];
}

export function describeVerdict(explain: InviteExplain): VerdictText {
  if (explain.stage === "invited") {
    const status = explain.details.sendStatus ?? "queued";
    return {
      headline: {
        key: `${NS}.understandInvites.invitedPosition`,
        params: {
          round: explain.details.roundNumber ?? "",
          rank: explain.details.rank ?? "",
          statusKey: describeSendStatus(status).key,
        },
      },
      reasons: [],
    };
  }
  const headline = describeStage(explain.stage);
  if (explain.stage === "eligibility") {
    return { headline, reasons: (explain.details.failures ?? []).map(describeEligibilityFailure) };
  }
  if (explain.stage === "no_round_matched") {
    const reasons: I18nText[] = [];
    for (const round of explain.details.rounds ?? []) {
      for (const failure of round.failures) {
        const inner = describeEligibilityFailure(failure);
        reasons.push({
          key: `${NS}.understandInvites.roundReason`,
          params: { round: round.number, reasonKey: inner.key, ...(inner.params ?? {}) },
        });
      }
    }
    return { headline, reasons };
  }
  return { headline, reasons: [] };
}
