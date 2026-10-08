export * from "./tokens";
export * from "./capacity";
export * from "./calendar-status";
export * from "./attendance-state";
export * from "./reminder-answer";
export * from "./calendar-card";
export * from "./class-colors";
export * from "./dashboard-format";
export * from "./dateLocale";
export * from "./presence-status";
export * from "./validation-tier";
export * from "./presence-scope";
export * from "./eligibility-report";
export * from "./level-direction";
export * from "./eligibility-tier";
export * from "./class-request-slots";
export * from "./availability";
export * from "./academy-classes";
export * from "./class-request-message";
export * from "./invite-simulation";
export * from "./calendar-overlap";
export * from "./calendar-grid";
export * from "./calendar-month";
export * from "./notify-blocked";
export * from "./blocker-draft";
export * from "./season-coverage";
export * from "./court-diagram";
export * from "./board-history";
export * from "./board-logic";
export * from "./countries";
export * from "./club-date";
export * from "./evaluation-form";
export * from "./evaluation-evolution";
export * from "./evaluation-class-panel";
export * from "./competency-manager";
export * from "./evaluation-form-session";
export * from "./hold-refusal";
export * from "./evaluation-share";
export * from "./restriction-bounds";
export * from "./quiet-hours";
export * from "./class-picker";
export * from "./unread-badge";
export * from "./class-request-list";
export * from "./join-request-message";
export * from "./recurrence-end";
export * from "./email-prompt";
export * from "./class-time";
export * from "./standing-end";

/**
 * dashboard.profile-completeness (PAD-490, #523): the student card's body names what is missing
 * and only its real cost. Shared so web and iOS pick the same sentence.
 */
export function profileIncompleteBodyKey(missing: readonly ("level" | "side")[]): string {
  const level = missing.includes("level");
  const side = missing.includes("side");
  if (level && side) return "dashboard.profileCompleteness.studentBodyBoth";
  if (level) return "dashboard.profileCompleteness.studentBodyLevel";
  return "dashboard.profileCompleteness.studentBodySide";
}
export * from "./waiting-list-first";
export * from "./invitation-outcome";
export * from "./name-search";
export * from "./class-level-match";
export * from "./walk-in-options";
export * from "./waiting-list-origin";
