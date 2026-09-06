/**
 * Font-utility resolution for React Native (compass R-025, PAD-156).
 *
 * RN does not synthesize weights for a custom family. Each weight is its own
 * registered PostScript face, so a face is reached by naming the FAMILY
 * (`font-sans-semibold` -> `PlusJakartaSans_600SemiBold`) and never by setting
 * `fontWeight` alone. A bare `font-semibold` is therefore inert: PAD-180
 * measured it on a simulator at 1.03x the ink of a no-weight control — Regular
 * — against 1.46x for `font-sans-semibold`.
 *
 * This collapses whatever font utilities a caller wrote into the single family
 * class that will actually render, so the rest of the app can keep typing
 * standard Tailwind weight names.
 */

type Family = "sans" | "display";
type Weight = "regular" | "medium" | "semibold" | "bold";

/**
 * The registered faces, from `tailwind.config.js`. Poppins ships only 600 and
 * 700 here, so the two lighter display weights round up to SemiBold rather
 * than falling back to a family that was not asked for.
 */
const FACE: Record<Family, Record<Weight, string>> = {
  sans: {
    regular: "font-sans",
    medium: "font-sans-medium",
    semibold: "font-sans-semibold",
    bold: "font-sans-bold",
  },
  display: {
    regular: "font-display-semibold",
    medium: "font-display-semibold",
    semibold: "font-display-semibold",
    bold: "font-display",
  },
};

/** A family utility names both a family and a weight. */
const FAMILY_UTILITY: Record<string, { family: Family; weight: Weight }> = {
  "font-sans": { family: "sans", weight: "regular" },
  "font-sans-medium": { family: "sans", weight: "medium" },
  "font-sans-semibold": { family: "sans", weight: "semibold" },
  "font-sans-bold": { family: "sans", weight: "bold" },
  "font-display": { family: "display", weight: "bold" },
  "font-display-semibold": { family: "display", weight: "semibold" },
};

/**
 * Tailwind's nine weight names folded onto the four faces that exist. Anything
 * lighter than 500 is Regular; anything heavier than 600 is Bold.
 */
const WEIGHT_UTILITY: Record<string, Weight> = {
  "font-thin": "regular",
  "font-extralight": "regular",
  "font-light": "regular",
  "font-normal": "regular",
  "font-medium": "medium",
  "font-semibold": "semibold",
  "font-bold": "bold",
  "font-extrabold": "bold",
  "font-black": "bold",
};

/**
 * Rewrites `className` so exactly one family class survives.
 *
 * Font utilities are read left to right, last one winning — the same order
 * NativeWind would resolve them in. A family utility sets both the family and
 * the weight; a weight utility changes only the weight, keeping the family.
 * Every other class is preserved, in its original order, with the resolved
 * family class appended.
 *
 * A string containing no font utility is returned untouched: emitting a family
 * the caller never asked for would silently restyle non-text nodes.
 */
export function resolveFontClass(className: string): string {
  const tokens = className.split(/\s+/).filter(Boolean);

  let family: Family | undefined;
  let weight: Weight | undefined;
  const rest: string[] = [];

  for (const token of tokens) {
    const asFamily = FAMILY_UTILITY[token];
    if (asFamily) {
      family = asFamily.family;
      weight = asFamily.weight;
      continue;
    }

    const asWeight = WEIGHT_UTILITY[token];
    if (asWeight) {
      weight = asWeight;
      continue;
    }

    rest.push(token);
  }

  if (family === undefined && weight === undefined) return className;

  return [...rest, FACE[family ?? "sans"][weight ?? "regular"]].join(" ");
}
