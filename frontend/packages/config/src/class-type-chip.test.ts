import { describe, expect, it } from "vitest";
import { classTypeChipKey } from "./class-type-chip";

describe("classTypeChipKey", () => {
  it("[CLASSES-DETAIL-VISIBILITY-6] names the chip for a private and an academy class, none otherwise", () => {
    expect(classTypeChipKey("private")).toBe("calendar.detail.typePrivate");
    expect(classTypeChipKey("academy")).toBe("calendar.detail.typeAcademy");
    expect(classTypeChipKey(undefined)).toBeNull();
    expect(classTypeChipKey("")).toBeNull();
    expect(classTypeChipKey("other")).toBeNull();
  });
});
