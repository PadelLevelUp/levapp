import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * auth.mobile-universal-links notes / B-043 (PAD-251): the brand assets that
 * transactional mail loads (`/brand/levapp-lockup-on-light.png`, referenced
 * from backend/padel_app/tools/email_templates.py) must never fall through to
 * the SPA `try_files … /index.html` fallback. When they did, a missing asset
 * answered 200 text/html — green for every status-only check, a broken image
 * for every human reading the mail.
 *
 * nginx is not available in the unit-test environment, so the config itself is
 * pinned: a `/brand/` location that answers a missing file with =404.
 */

const NGINX_CONF = path.resolve(__dirname, "../../nginx.conf");

function locationBlock(conf: string, matcher: string): string | null {
  const start = conf.indexOf(`location ${matcher} {`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = conf.indexOf("{", start); i < conf.length; i += 1) {
    if (conf[i] === "{") depth += 1;
    if (conf[i] === "}") {
      depth -= 1;
      if (depth === 0) return conf.slice(start, i + 1);
    }
  }
  return null;
}

describe("nginx.conf serves /brand/ assets honestly", () => {
  const conf = readFileSync(NGINX_CONF, "utf8");

  it("has a /brand/ location outside the SPA fallback", () => {
    expect(locationBlock(conf, "/brand/")).not.toBeNull();
  });

  it("answers a missing brand asset with 404, never index.html", () => {
    const block = locationBlock(conf, "/brand/") ?? "";
    expect(block).toMatch(/try_files\s+\$uri\s+=404;/);
    expect(block).not.toContain("index.html");
  });

  it("still keeps the SPA fallback for everything else", () => {
    const root = locationBlock(conf, "/") ?? "";
    expect(root).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/);
  });
});
