/**
 * PAD-218: two checkouts never share a database or a port by default.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  liveLock,
  lockPath,
  releaseLock,
  resolveE2EIsolation,
  SHARED_BACKEND_PORT,
  SHARED_DB_NAME,
  SHARED_WEB_PORT,
  writeLock,
} from "../../e2e/isolation";

const A = "/Users/someone/levapp/frontend/apps/web";
const B = "/Users/someone/levapp-wt-c/frontend/apps/web";

describe("resolveE2EIsolation", () => {
  it("derives a per-checkout database and ports when nothing is set", () => {
    const a = resolveE2EIsolation({}, A);
    expect(a.source).toBe("derived");
    expect(a.dbName).toMatch(/^levelup_e2e_[0-9a-f]{8}$/);
    expect(a.dbName).not.toBe(SHARED_DB_NAME);
    expect(Number(a.backendPort)).toBeGreaterThanOrEqual(5100);
    expect(Number(a.backendPort)).toBeLessThan(5400);
    expect(Number(a.webPort)).toBeGreaterThanOrEqual(8100);
    expect(Number(a.webPort)).toBeLessThan(8400);
  });

  it("is deterministic per checkout and different across checkouts", () => {
    const a1 = resolveE2EIsolation({}, A);
    const a2 = resolveE2EIsolation({}, A);
    const b = resolveE2EIsolation({}, B);
    expect(a1).toEqual(a2);
    expect(b.dbName).not.toBe(a1.dbName);
  });

  it("lets explicit env win, field by field", () => {
    const r = resolveE2EIsolation({ E2E_DB_NAME: "levelup_e2e_c", E2E_BACKEND_PORT: "5013" }, A);
    expect(r.dbName).toBe("levelup_e2e_c");
    expect(r.backendPort).toBe("5013");
    expect(r.webPort).toMatch(/^8[1-3]\d\d$/);
    expect(r.source).toBe("derived");
    const full = resolveE2EIsolation(
      { E2E_DB_NAME: "x", E2E_BACKEND_PORT: "1", E2E_WEB_PORT: "2" },
      A
    );
    expect(full.source).toBe("env");
  });

  it("E2E_SHARED=1 opts back into the single-session shared stack", () => {
    const r = resolveE2EIsolation({ E2E_SHARED: "1" }, A);
    expect(r).toMatchObject({
      dbName: SHARED_DB_NAME,
      backendPort: SHARED_BACKEND_PORT,
      webPort: SHARED_WEB_PORT,
      source: "shared",
    });
  });
});

describe("run lock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levapp-e2e-lock-"));

  it("is live while its pid is alive and stale once it is not", () => {
    writeLock("levelup_e2e_t", "/checkout/a", dir, 4242);
    expect(liveLock("levelup_e2e_t", dir, () => true)?.pid).toBe(4242);
    expect(liveLock("levelup_e2e_t", dir, () => false)).toBeNull();
    expect(fs.existsSync(lockPath("levelup_e2e_t", dir))).toBe(true);
  });

  it("is released only by its owner", () => {
    writeLock("levelup_e2e_u", "/checkout/a", dir, 4242);
    expect(releaseLock("levelup_e2e_u", dir, 9999)).toBe(false);
    expect(fs.existsSync(lockPath("levelup_e2e_u", dir))).toBe(true);
    expect(releaseLock("levelup_e2e_u", dir, 4242)).toBe(true);
    expect(fs.existsSync(lockPath("levelup_e2e_u", dir))).toBe(false);
  });

  it("treats garbage as no lock", () => {
    fs.writeFileSync(lockPath("levelup_e2e_v", dir), "not json");
    expect(liveLock("levelup_e2e_v", dir, () => true)).toBeNull();
  });
});
