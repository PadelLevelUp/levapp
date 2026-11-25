/**
 * PAD-925 (`classes.detail-visibility` rule 6): the "Particular" / "Academia" chip beside the
 * class detail's title. Both shells ask here which `calendar.detail.*` key to show, so the
 * mapping cannot drift. An unknown or missing type shows no chip.
 */
export type ClassTypeChipKey = "calendar.detail.typePrivate" | "calendar.detail.typeAcademy";

export function classTypeChipKey(classType: string | null | undefined): ClassTypeChipKey | null {
  if (classType === "private") return "calendar.detail.typePrivate";
  if (classType === "academy") return "calendar.detail.typeAcademy";
  return null;
}
