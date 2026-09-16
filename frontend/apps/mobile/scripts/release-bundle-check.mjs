/**
 * The release bundle check (PAD-351, `mobile.release-build-target` rules 4-5).
 *
 * A pure function over the bytes of an archived `main.jsbundle`. Hermes
 * bytecode keeps string literals readable in its string table, so a byte
 * search finds the inlined API URL and the capability declaration.
 */

/** API URLs a release bundle must never carry unless it is that URL's target. */
export const STRAY_API_URLS = ["https://padellevelup.com/api", "http://localhost:5001/api"];

export const CAPABILITIES_HEADER = "X-LevApp-Capabilities";
export const REQUIRED_CAPABILITIES = ["open-spots"];

/**
 * @param {string} bundle   the bundle's bytes, read as latin1
 * @param {string} target   the target the build was named for
 * @param {Record<string, string>} targets  release-targets.json
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkReleaseBundle(bundle, target, targets) {
  const problems = [];
  const expected = targets[target];
  if (!expected) {
    problems.push(`unknown target "${target}" (known: ${Object.keys(targets).join(", ")})`);
    return { ok: false, problems };
  }
  if (!bundle.includes(expected)) {
    problems.push(`the bundle does not contain ${expected}, the "${target}" API URL`);
  }
  const others = [...Object.values(targets), ...STRAY_API_URLS].filter((url) => url !== expected);
  for (const url of new Set(others)) {
    // Whole-URL matches can overlap: https://levapp.app/api is not inside
    // https://staging.levapp.app/api, but guard against a target that is.
    if (expected.includes(url)) continue;
    if (bundle.includes(url)) {
      problems.push(`the bundle contains ${url}, which is not the "${target}" API URL`);
    }
  }
  if (!bundle.includes(CAPABILITIES_HEADER)) {
    problems.push(`the bundle does not contain the ${CAPABILITIES_HEADER} header name (PAD-352)`);
  }
  for (const token of REQUIRED_CAPABILITIES) {
    if (!bundle.includes(token)) {
      problems.push(`the bundle does not declare the "${token}" capability (PAD-352)`);
    }
  }
  return { ok: problems.length === 0, problems };
}
