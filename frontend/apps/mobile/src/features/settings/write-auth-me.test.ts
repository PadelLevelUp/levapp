/**
 * B-185 (PAD-454). The mobile harness cannot mount react-query hooks (two React copies), so
 * this drives the race on a real QueryClient, which needs no React: an ["auth-me"] fetch that
 * started before a save lands after it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { AUTH_ME_KEY, writeAuthMe } from "./write-auth-me";

type Me = { language: "pt" | "en"; requestAlerts?: boolean };

function staleFetchInFlight(client: QueryClient, answer: Me) {
  let land!: () => void;
  const fetching = client
    .fetchQuery({
      queryKey: AUTH_ME_KEY,
      queryFn: () => new Promise<Me>((resolve) => (land = () => resolve(answer))),
      staleTime: 0,
    })
    .catch(() => undefined); // a cancelled fetch rejects; that is the point
  return { land: () => land(), fetching };
}

describe("writeAuthMe (B-185)", () => {
  it("keeps the saved profile when an older auth-me fetch lands after the save", async () => {
    const client = new QueryClient();
    client.setQueryData<Me>(AUTH_ME_KEY, { language: "en" });
    const stale = staleFetchInFlight(client, { language: "en" }); // read before the save

    await writeAuthMe<Me>(client, { language: "pt" }); // the PATCH answered pt
    stale.land();
    await stale.fetching;

    expect(client.getQueryData<Me>(AUTH_ME_KEY)).toEqual({ language: "pt" });
  });

  it("returns what it wrote and writes it when nothing is in flight", async () => {
    const client = new QueryClient();
    const out = await writeAuthMe<Me>(client, { language: "en", requestAlerts: false });
    expect(out).toEqual({ language: "en", requestAlerts: false });
    expect(client.getQueryData<Me>(AUTH_ME_KEY)).toEqual({ language: "en", requestAlerts: false });
  });
});

describe("every save writes its answer through writeAuthMe (B-185)", () => {
  // The mobile harness cannot mount these sections, so pin the wiring in the source. Every
  // setQueryData on ["auth-me"] (by literal or AUTH_ME_KEY, whatever the value is called) outside
  // write-auth-me.ts must be one of two shapes that are not a save's answer: an updater function
  // (an optimistic write, which must follow a cancelQueries in the same file) or the `previous`
  // rollback. Anything else is an answer written past writeAuthMe, which reopens the race.
  const root = join(__dirname, "..", "..", "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const files = [join(root, "src"), join(root, "app")]
    .flatMap((dir) => walk(dir))
    .filter((f) => !f.endsWith(join("settings", "write-auth-me.ts")));
  const WRITE = /setQueryData(?:<[^>]*>)?\(\s*(?:\["auth-me"\]|AUTH_ME_KEY)\s*,\s*([^,)\s][^,)]*)/g;
  const CANCEL = /cancelQueries\(\s*\{\s*queryKey:\s*(?:\["auth-me"\]|AUTH_ME_KEY)/;

  it("writes to ['auth-me'] outside writeAuthMe are only optimistic updaters or the rollback", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(WRITE)) {
        const value = m[1].trim();
        const rel = `${relative(root, f)}: setQueryData(auth-me, ${value.slice(0, 20)}…)`;
        if (value === "previous") continue;
        if (value.startsWith("(")) {
          const cancelAt = src.search(CANCEL);
          if (cancelAt < 0 || cancelAt > (m.index ?? 0)) bad.push(`${rel} (optimistic write without a cancelQueries before it)`);
          continue;
        }
        bad.push(rel);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the three sections write a save's answer through writeAuthMe", () => {
    const wired = files.filter((f) => /writeAuthMe\(queryClient, updated\)/.test(readFileSync(f, "utf8")));
    expect(wired.map((f) => relative(root, f)).sort()).toEqual([
      "src/features/settings/preferences-section.tsx",
      "src/features/settings/profile-section.tsx",
      "src/features/settings/student-notification-blocks-section.tsx",
    ]);
  });
});
