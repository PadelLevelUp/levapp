import { afterEach, describe, expect, it } from "vitest";

import { webTokenStorage } from "@/api/client";
import { endViewAs, getViewAsToken, isViewingAs, startViewAs, tokenFromFragment, VIEW_AS_TOKEN_KEY } from "./viewAs";

const JWT = "aaa.bbb.ccc";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("view as (admin.approvals-and-users rule 9)", () => {
  it("reads a JWT-shaped token from the fragment and nothing else", () => {
    expect(tokenFromFragment(`#${JWT}`)).toBe(JWT);
    expect(tokenFromFragment("#not a token")).toBeNull();
    expect(tokenFromFragment("")).toBeNull();
  });

  it("keeps the token for this tab only, and it wins over the normal session", async () => {
    localStorage.setItem("accessToken", "normal");
    startViewAs(JWT);
    expect(sessionStorage.getItem(VIEW_AS_TOKEN_KEY)).toBe(JWT);
    expect(localStorage.getItem("accessToken")).toBe("normal");
    expect(await webTokenStorage.getToken()).toBe(JWT);
    expect(isViewingAs()).toBe(true);
  });

  it("never stores a refreshed token and never touches the normal session while viewing as", async () => {
    localStorage.setItem("accessToken", "normal");
    startViewAs(JWT);
    await webTokenStorage.setToken("refreshed");
    expect(localStorage.getItem("accessToken")).toBe("normal");
    await webTokenStorage.removeToken();
    expect(getViewAsToken()).toBeNull();
    expect(localStorage.getItem("accessToken")).toBe("normal");
    expect(await webTokenStorage.getToken()).toBe("normal");
  });

  it("an ordinary session is unchanged", async () => {
    await webTokenStorage.setToken("t1");
    expect(await webTokenStorage.getToken()).toBe("t1");
    await webTokenStorage.removeToken();
    expect(localStorage.getItem("accessToken")).toBeNull();
    endViewAs();
  });
});
