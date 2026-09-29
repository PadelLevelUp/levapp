import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * mobile.release-build-target rule 3a — a release is archived only with an Xcode
 * whose SDK the app can launch under. Builds linked against the iOS 27 SDK
 * (Xcode 27) crash at launch because the app has not adopted the UIScene
 * lifecycle; PAD-467 tracks the real fix. Until then `scripts/check-xcode.sh`
 * refuses Xcode 27 and later, and `ios-release.sh` runs it before touching
 * anything. The check is run for real here, against a stub `xcodebuild` on PATH.
 */
const MOBILE = path.resolve(__dirname, "..", "..");
const CHECK = path.join(MOBILE, "scripts", "check-xcode.sh");
const RELEASE = path.join(MOBILE, "scripts", "ios-release.sh");

const stubDirs: string[] = [];
afterAll(() => stubDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** Run the check with an `xcodebuild` that prints `versionOutput`. */
function runCheck(versionOutput: string, env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xcode-stub-"));
  stubDirs.push(dir);
  const stub = path.join(dir, "xcodebuild");
  fs.writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(versionOutput)}\n`);
  fs.chmodSync(stub, 0o755);
  expect(fs.existsSync(CHECK), `cannot find ${CHECK}`).toBe(true);
  return spawnSync("bash", [CHECK], {
    encoding: "utf8",
    // Only the stub dir and the system basics: the real xcodebuild must not answer.
    // NODE_ENV because the app types ProcessEnv with it as required.
    env: { NODE_ENV: "test", PATH: `${dir}:/usr/bin:/bin`, ...env },
  });
}

describe("scripts/check-xcode.sh (rule 3a)", () => {
  it("passes Xcode 26.6", () => {
    const r = runCheck("Xcode 26.6\nBuild version 17F113");
    expect(r.status, r.stderr).toBe(0);
  });

  it("refuses Xcode 27.0 and names PAD-467 and DEVELOPER_DIR", () => {
    const r = runCheck("Xcode 27.0\nBuild version 27A266a");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/PAD-467/);
    expect(r.stderr).toMatch(/DEVELOPER_DIR/);
  });

  it("refuses a later major too", () => {
    expect(runCheck("Xcode 28.1\nBuild version 28B1").status).not.toBe(0);
  });

  it("refuses when the version cannot be read (fails closed)", () => {
    expect(runCheck("something unexpected").status).not.toBe(0);
  });

  it("lets an explicit override through, loudly", () => {
    const r = runCheck("Xcode 27.0\nBuild version 27A266a", { LEVAPP_ALLOW_XCODE_27: "1" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/LEVAPP_ALLOW_XCODE_27/);
  });
});

describe("scripts/ios-release.sh runs the check first (rule 3a)", () => {
  it("calls check-xcode.sh before it edits app.json or prebuilds", () => {
    const text = fs.readFileSync(RELEASE, "utf8");
    const check = text.indexOf("check-xcode.sh");
    expect(check, "ios-release.sh never runs check-xcode.sh").toBeGreaterThan(-1);
    expect(check).toBeLessThan(text.indexOf("cp app.json"));
    expect(check).toBeLessThan(text.indexOf("npm run prebuild:ios"));
  });
});
