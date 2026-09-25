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
  // The mobile harness cannot mount these sections, so pin the wiring in the source: a save's
  // answer written straight into ["auth-me"] reopens the race. The optimistic update and the
  // rollback in preferences-section (an updater function and `previous`) are not answers.
  it("no mobile file writes a save's answer into ['auth-me'] directly", () => {
    const root = join(__dirname, "..", "..", "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
      });
    const files = [join(root, "src"), join(root, "app")].flatMap((dir) => walk(dir));
    const direct = files.filter((f) => /setQueryData\(\s*\["auth-me"\]\s*,\s*updated\s*\)/.test(readFileSync(f, "utf8")));
    expect(direct.map((f) => relative(root, f))).toEqual([]);
    const wired = files.filter((f) => /writeAuthMe\(queryClient, updated\)/.test(readFileSync(f, "utf8")));
    expect(wired.map((f) => relative(root, f)).sort()).toEqual([
      "src/features/settings/preferences-section.tsx",
      "src/features/settings/profile-section.tsx",
      "src/features/settings/student-notification-blocks-section.tsx",
    ]);
  });
});
