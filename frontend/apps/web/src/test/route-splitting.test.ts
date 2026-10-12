import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * client.route-loading rules 1 and 4 (PAD-585): "No page is imported statically".
 * A static page import in App.tsx or HomeRoute.tsx puts that page (and everything it imports)
 * back into the first download; a lazy page built without lazyWithReload breaks after a deploy.
 */
const src = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(src, rel), "utf8");

const STATIC_PAGE_IMPORT = /^import\s[^;]*from\s+["'](?:\.\/|@\/)pages\/[^"']+["'];?/m;

describe("route splitting", () => {
  it.each(["App.tsx", "auth/HomeRoute.tsx"])("%s imports no page module statically", (file) => {
    const source = read(file);
    expect(source).toContain('from "@/routes/lazyPages"');
    expect(source.match(STATIC_PAGE_IMPORT)?.[0]).toBeUndefined();
  });

  it("every page App.tsx renders comes from lazyPages, each built with lazyWithReload", () => {
    const app = read("App.tsx");
    const block = /import \{([^}]+)\} from "@\/routes\/lazyPages";/.exec(app);
    expect(block).not.toBeNull();
    const names = block![1].split(",").map((n) => n.trim()).filter(Boolean);
    // Proves the guard found its subject (R-032): the app has ~31 pages.
    expect(names.length).toBeGreaterThan(25);

    const lazyPages = read("routes/lazyPages.ts");
    for (const name of names) {
      expect(lazyPages, name).toMatch(new RegExp(`export const ${name} = lazyWithReload\\(loaders\\.${name}\\);`));
    }
  });

  it("lazyPages is the only module with a dynamic import of a page", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (/import\(\s*["'](?:\.\.?\/|@\/)(?:[^"']*\/)?pages\//.test(readFileSync(full, "utf8"))) {
            offenders.push(path.relative(src, full));
          }
        }
      }
    };
    walk(src);
    expect(offenders).toEqual(["routes/lazyPages.ts"]);
  });
});
