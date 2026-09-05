import { describe, expect, it } from "vitest";

import { resolveFontClass } from "./font-class";

/**
 * PAD-156 / compass R-025.
 *
 * React Native does not synthesize weights for a custom family: each weight is
 * its own registered PostScript face, reached only by naming the FAMILY
 * (`font-sans-semibold`), never by `fontWeight` alone (`font-semibold`).
 * PAD-180 measured this on a simulator — `font-semibold` came out at 1.03x the
 * ink of a no-weight control (i.e. Regular), `font-sans-semibold` at 1.46x.
 *
 * So the 105 bare weight utilities in this app are dead classes. Rather than
 * sweep them, the `Text` wrapper maps them onto the face that exists. This
 * pins that mapping; that the mapped face renders heavy is PAD-180's evidence.
 */

describe("resolveFontClass", () => {
  it("maps a bare weight utility onto the family face that exists", () => {
    expect(resolveFontClass("font-sans font-semibold")).toBe(
      "font-sans-semibold"
    );
    expect(resolveFontClass("font-sans font-medium")).toBe("font-sans-medium");
    expect(resolveFontClass("font-sans font-bold")).toBe("font-sans-bold");
  });

  it("emits exactly one family class, never a base plus an override", () => {
    // twMerge does not know the custom `font-sans-*` utilities, so without
    // this both would survive and only NativeWind's last-wins ordering would
    // save it. Collapsing here removes that load-bearing coincidence.
    const out = resolveFontClass("font-sans text-base font-bold");

    // Token-wise, not substring-wise: "font-sans" is a prefix of
    // "font-sans-bold", so a regex would match the survivor and prove nothing.
    const fontTokens = out.split(/\s+/).filter((c) => c.startsWith("font-"));
    expect(fontTokens).toEqual(["font-sans-bold"]);
    expect(fontTokens).not.toContain("font-sans");
  });

  it("leaves the 30 already-correct family call sites alone", () => {
    expect(resolveFontClass("font-sans font-sans-semibold")).toBe(
      "font-sans-semibold"
    );
    expect(resolveFontClass("font-sans font-display")).toBe("font-display");
  });

  it("keeps non-font classes, and their order", () => {
    expect(resolveFontClass("text-sm font-semibold text-muted-foreground")).toBe(
      "text-sm text-muted-foreground font-sans-semibold"
    );
  });

  it("treats a weightless string as Regular, not as a missing family", () => {
    // The resolved family class is appended, so non-font classes keep their
    // order and the family lands last. Position is free: exactly one family
    // class survives, so there is nothing for it to conflict with.
    expect(resolveFontClass("font-sans text-base")).toBe("text-base font-sans");
  });

  it("maps the weight synonyms onto the four faces that exist", () => {
    // Only 400/500/600/700 are registered; the rest must land on one of them
    // rather than silently falling back to Regular.
    expect(resolveFontClass("font-sans font-light")).toBe("font-sans");
    expect(resolveFontClass("font-sans font-normal")).toBe("font-sans");
    expect(resolveFontClass("font-sans font-extrabold")).toBe("font-sans-bold");
    expect(resolveFontClass("font-sans font-black")).toBe("font-sans-bold");
  });

  it("honours a weight applied to the display family", () => {
    // Poppins ships only 600 and 700 here, so display + semibold is reachable
    // and display + medium has to round to the lightest face that exists.
    expect(resolveFontClass("font-display font-semibold")).toBe(
      "font-display-semibold"
    );
    expect(resolveFontClass("font-display font-medium")).toBe(
      "font-display-semibold"
    );
  });

  it("lets the last font utility win, matching NativeWind ordering", () => {
    expect(resolveFontClass("font-sans-bold font-medium")).toBe(
      "font-sans-medium"
    );
    expect(resolveFontClass("font-semibold font-display")).toBe("font-display");
  });

  it("leaves a string with no font utility untouched", () => {
    expect(resolveFontClass("text-sm text-foreground")).toBe(
      "text-sm text-foreground"
    );
  });
});
