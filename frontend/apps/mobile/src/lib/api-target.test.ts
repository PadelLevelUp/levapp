import { describe, expect, it } from "vitest";
import { describeApiTarget, showsTestServerNotice } from "./api-target";

/** PAD-351 (`mobile.release-build-target` rules 6-7). */
describe("describeApiTarget", () => {
  it("names production by its host", () => {
    expect(describeApiTarget("https://levapp.app/api")).toEqual({
      host: "levapp.app",
      isProduction: true,
    });
  });

  it("names staging, the old host and a local backend as not production", () => {
    expect(describeApiTarget("https://staging.levapp.app/api")).toEqual({
      host: "staging.levapp.app",
      isProduction: false,
    });
    expect(describeApiTarget("https://padellevelup.com/api").isProduction).toBe(false);
    expect(describeApiTarget("http://localhost:5001/api")).toEqual({
      host: "localhost:5001",
      isProduction: false,
    });
  });

  it("keeps an unparseable value visible rather than calling it production", () => {
    expect(describeApiTarget("not a url")).toEqual({ host: "not a url", isProduction: false });
  });
});

describe("showsTestServerNotice", () => {
  it("warns on sign-in only in a release build that is not production", () => {
    expect(showsTestServerNotice("https://staging.levapp.app/api", false)).toBe(true);
    expect(showsTestServerNotice("https://levapp.app/api", false)).toBe(false);
    expect(showsTestServerNotice("https://staging.levapp.app/api", true)).toBe(false);
    expect(showsTestServerNotice("http://localhost:5001/api", true)).toBe(false);
  });
});
