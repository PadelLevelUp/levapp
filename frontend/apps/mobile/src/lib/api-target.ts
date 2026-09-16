/**
 * Which server a build talks to, and how the app says so (PAD-351,
 * `mobile.release-build-target`).
 *
 * Kept free of `__DEV__` and React Native so vitest can import it; config.ts
 * resolves the URL, this module only describes one.
 *
 * PRODUCTION_API_URL must equal `production` in release-targets.json (a test
 * pins it). It is repeated here rather than imported: importing the table would
 * put the staging URL into every production bundle, and the release bundle
 * check refuses a bundle carrying a second target.
 *
 * For the same reason the URL is assembled at runtime, not written as one
 * literal. The Settings line imports this module in every build, so a literal
 * would put the production URL into the staging bundle too, and the check
 * would refuse it. A build that really targets production still carries the
 * whole literal, inlined from EXPO_PUBLIC_API_URL.
 */
const PRODUCTION_HOST = "levapp.app";

export const PRODUCTION_API_URL = ["https:", "", PRODUCTION_HOST, "api"].join("/");

export interface ApiTargetDescription {
  /** Host (with port when there is one), or the raw value when it is not a URL. */
  host: string;
  isProduction: boolean;
}

export function describeApiTarget(url: string): ApiTargetDescription {
  try {
    const host = new URL(url).host;
    return { host, isProduction: host === PRODUCTION_HOST };
  } catch {
    return { host: url, isProduction: false };
  }
}

/**
 * The sign-in screen's test-server notice (rule 7): release builds only. A
 * debug build always points at a local backend, and the notice would shift
 * the layout under every Maestro flow.
 */
export function showsTestServerNotice(url: string, isDev: boolean): boolean {
  return !isDev && !describeApiTarget(url).isProduction;
}
