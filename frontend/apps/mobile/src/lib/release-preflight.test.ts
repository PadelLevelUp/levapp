import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * mobile.release-build-target rules 3c–3e — the release scripts name their prebuilt cache, their
 * output folder and their Python before they act. Both scripts are run for real, stopped before
 * anything heavy: `ios-release.sh` with `LEVAPP_RELEASE_PREFLIGHT_ONLY=1` and a stub `xcodebuild`
 * that reports Xcode 26.6, `testflight-upload.sh` with a stub `xcrun` that records whether the
 * upload was called. HOME is a temp folder, so the default output folder is never created for real.
 */
const MOBILE = path.resolve(__dirname, "..", "..");
const RELEASE = path.join(MOBILE, "scripts", "ios-release.sh");
const UPLOAD = path.join(MOBILE, "scripts", "testflight-upload.sh");
const APP_JSON = path.join(MOBILE, "app.json");
const RN_VERSION: string = JSON.parse(fs.readFileSync(path.join(MOBILE, "package.json"), "utf8")).dependencies[
  "react-native"
];

const tmpDirs: string[] = [];
afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/**
 * A stub dir with an `xcodebuild` that reports Xcode 26.6, an `xcrun` that leaves a marker, and an
 * `npm` and a `pod` that refuse: a script that ran past its preflight would otherwise prebuild the
 * app for real, so it fails here instead.
 */
function stubs(): { dir: string; xcrunMarker: string } {
  const dir = tmp("release-stubs-");
  const xcrunMarker = path.join(dir, "xcrun-called");
  const write = (name: string, body: string) => {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`);
    fs.chmodSync(path.join(dir, name), 0o755);
  };
  write("xcodebuild", "printf 'Xcode 26.6\\nBuild version 17F113\\n'");
  write("xcrun", `touch ${JSON.stringify(xcrunMarker)}`);
  write("npm", "echo 'npm reached past the preflight' >&2; exit 97");
  write("pod", "echo 'pod reached past the preflight' >&2; exit 97");
  return { dir, xcrunMarker };
}

/** A prebuilt cache holding the release tarballs named in `names` (empty files: nothing reads them). */
function cache(names: ("core" | "deps")[] = ["core", "deps"]): string {
  const pods = tmp("rn-prebuilt-");
  if (names.includes("core")) {
    fs.mkdirSync(path.join(pods, "ReactNativeCore-artifacts"));
    fs.writeFileSync(path.join(pods, "ReactNativeCore-artifacts", `reactnative-core-${RN_VERSION}-release.tar.gz`), "");
  }
  if (names.includes("deps")) {
    fs.mkdirSync(path.join(pods, "ReactNativeDependencies-artifacts"));
    fs.writeFileSync(
      path.join(pods, "ReactNativeDependencies-artifacts", `reactnative-dependencies-${RN_VERSION}-release.tar.gz`),
      ""
    );
  }
  return pods;
}

function run(script: string, args: string[], env: Record<string, string>) {
  const { dir } = env.STUB_DIR ? { dir: env.STUB_DIR } : stubs();
  const { STUB_DIR: _ignored, ...rest } = env;
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    // The stubs first, then node (ios-release.sh reads its tables with it) and the system basics.
    env: {
      NODE_ENV: "test",
      HOME: tmp("release-home-"),
      PATH: `${dir}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      ...rest,
    },
  });
}

function preflight(env: Record<string, string>) {
  return run(RELEASE, ["production", "1.3.4", "37"], { LEVAPP_RELEASE_PREFLIGHT_ONLY: "1", ...env });
}

describe("ios-release.sh checks its prebuilt cache before anything changes (rule 3c)", () => {
  it("[MOBILE-RELEASE-BUILD-TARGET-12] refuses when RN_PREBUILT_PODS is unset, and leaves app.json alone", () => {
    const before = fs.readFileSync(APP_JSON, "utf8");
    const r = preflight({});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RN_PREBUILT_PODS/);
    expect(fs.readFileSync(APP_JSON, "utf8")).toBe(before);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-12] refuses a cache missing a release tarball, naming it", () => {
    const before = fs.readFileSync(APP_JSON, "utf8");
    const r = preflight({ RN_PREBUILT_PODS: cache(["core"]) });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RN_PREBUILT_PODS/);
    expect(r.stderr).toContain(`reactnative-dependencies-${RN_VERSION}-release.tar.gz`);
    expect(fs.readFileSync(APP_JSON, "utf8")).toBe(before);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-12] refuses a cache inside the app's ios/, which prebuild --clean deletes", () => {
    const before = fs.readFileSync(APP_JSON, "utf8");
    const r = preflight({ RN_PREBUILT_PODS: path.join(MOBILE, "ios", "Pods") });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RN_PREBUILT_PODS/);
    expect(r.stderr).toMatch(/ios\//);
    expect(fs.readFileSync(APP_JSON, "utf8")).toBe(before);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-12] passes a complete cache outside ios/ and stops there with exit 0", () => {
    const before = fs.readFileSync(APP_JSON, "utf8");
    const r = preflight({ RN_PREBUILT_PODS: cache() });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`preflight ok: react-native ${RN_VERSION}`);
    expect(fs.readFileSync(APP_JSON, "utf8")).toBe(before);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-12] feeds pod install the tarballs it checked, with no hard-coded version", () => {
    const text = fs.readFileSync(RELEASE, "utf8");
    expect(text).not.toMatch(/levapp-tf-wt/);
    expect(text).not.toMatch(/0\.81\.5/);
    expect(text).toMatch(/^export RCT_TESTONLY_RNCORE_TARBALL_PATH="\$RN_CORE_TARBALL"$/m);
    expect(text).toMatch(/^export RCT_USE_LOCAL_RN_DEP="\$RN_DEPS_TARBALL"$/m);
  });
});

describe("both release scripts default to one folder outside the worktree (rule 3d)", () => {
  it("[MOBILE-RELEASE-BUILD-TARGET-13] ios-release.sh defaults to ~/levapp-ios-archives/<version>-build<build>", () => {
    const home = tmp("release-home-");
    const r = preflight({ HOME: home, RN_PREBUILT_PODS: cache() });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`release-out ${home}/levapp-ios-archives/1.3.4-build37`);
    // The preflight stops before it creates anything.
    expect(fs.existsSync(path.join(home, "levapp-ios-archives"))).toBe(false);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-13] testflight-upload.sh looks for the export in the same default", () => {
    const home = tmp("release-home-");
    const r = run(UPLOAD, ["1.3.4", "37"], { HOME: home });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`${home}/levapp-ios-archives/1.3.4-build37/export-37`);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-13] a set RELEASE_OUT wins in both", () => {
    const out = tmp("release-out-");
    const release = preflight({ RELEASE_OUT: out, RN_PREBUILT_PODS: cache() });
    expect(release.status, release.stderr).toBe(0);
    expect(release.stdout).toContain(`release-out ${out}`);
    const upload = run(UPLOAD, ["1.3.4", "37"], { RELEASE_OUT: out });
    expect(upload.stderr).toContain(`${out}/export-37`);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-13] testflight-upload.sh takes the version and the build", () => {
    const r = run(UPLOAD, ["37"], {});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage: .*<version> <build-number>/);
  });
});

describe("testflight-upload.sh finds its Python before it uploads (rule 3e)", () => {
  /** A RELEASE_OUT holding an export as ios-release.sh leaves it. */
  function exported(): string {
    const out = tmp("release-out-");
    fs.mkdirSync(path.join(out, "export-37"));
    fs.writeFileSync(
      path.join(out, "export-37", "release-target.txt"),
      "production\nhttps://levapp.app/api\n1.3.4\n37\n"
    );
    return out;
  }

  it("[MOBILE-RELEASE-BUILD-TARGET-14] refuses a missing ASC_PYTHON, naming it, and never calls altool", () => {
    const { dir, xcrunMarker } = stubs();
    const r = run(UPLOAD, ["1.3.4", "37"], {
      STUB_DIR: dir,
      RELEASE_OUT: exported(),
      ASC_PYTHON: path.join(dir, "no-such-python"),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/ASC_PYTHON/);
    expect(fs.existsSync(xcrunMarker)).toBe(false);
  });

  it("[MOBILE-RELEASE-BUILD-TARGET-14] refuses when neither default venv exists, and never calls altool", () => {
    // A copy of the script in a tree that is no git checkout and has no backend venv: both
    // defaults (this checkout's venv, the main worktree's) are absent.
    const repo = tmp("release-repo-");
    const scripts = path.join(repo, "frontend", "apps", "mobile", "scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.copyFileSync(UPLOAD, path.join(scripts, "testflight-upload.sh"));
    const { dir, xcrunMarker } = stubs();
    const r = run(path.join(scripts, "testflight-upload.sh"), ["1.3.4", "37"], {
      STUB_DIR: dir,
      RELEASE_OUT: exported(),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/ASC_PYTHON/);
    expect(fs.existsSync(xcrunMarker)).toBe(false);
  });
});
