/**
 * B-266 (clubs.courts rule 7) on iOS: the class editor offers the courts of THE CLASS's club — what
 * edit_class validates against — not the coach's current club's. `classCourtsQuery` is the query the
 * editor uses; the wiring check pins that `app/class/[id].tsx` builds it from the class's own club.
 * The screen itself is not mounted (1,700 lines; the mobile harness cannot mount react-query against
 * the app's React copy), so that half is a static check on the screen's source.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listCourtsForClass: vi.fn(async () => [{ id: 3, clubId: 7, name: "O", position: 0 }]) }));
vi.mock("@levelup/api", () => ({ courtsApi: api }));

import { classCourtsQuery } from "./class-courts";

beforeEach(() => api.listCourtsForClass.mockClear());

describe("classCourtsQuery (B-266)", () => {
  it("is keyed by the class's club and lists that club's courts", async () => {
    const q = classCourtsQuery(7);
    expect(q.queryKey).toEqual(["class-courts", 7]);
    expect(await q.queryFn()).toEqual([{ id: 3, clubId: 7, name: "O", position: 0 }]);
    expect(api.listCourtsForClass).toHaveBeenCalledWith({ clubId: 7 });
  });

  it("two classes at two clubs never share a cache entry", () => {
    expect(classCourtsQuery(7).queryKey).not.toEqual(classCourtsQuery(8).queryKey);
  });
});

describe("the iOS class editor uses the class's club (B-266, static wiring check)", () => {
  const screen = readFileSync(join(__dirname, "..", "..", "..", "app", "class", "[id].tsx"), "utf8");

  it("builds its court query from the instance's own club", () => {
    expect(screen).toMatch(/classCourtsQuery\(\s*instance\?\.clubId\s*\)/);
  });

  it("no longer reads the coach's current club for the editor", () => {
    expect(screen).not.toMatch(/getCoachClub\(/);
  });
});
