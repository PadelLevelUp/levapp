import { describe, it, expect, vi, beforeEach } from "vitest";
import { initApi } from "../client";
import type { TokenStorage } from "../storage";
import {
  FIELD_CONFLICT_KEYS,
  checkFieldAvailable,
  checkFieldConflict,
  fieldConflictReason,
  fieldConflictText,
} from "./fields";

// B-102 / players.duplicate-name-check rule 7: the backend's 409 message is
// English prose; the client maps the known reasons to locale keys.

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

function answer(status: number, data: unknown) {
  const client = initApi({ baseURL: "http://api.test", storage });
  client.defaults.adapter = async (config) => {
    if (status >= 400) {
      const err: any = new Error(`status ${status}`);
      err.response = { status, data, statusText: "", headers: {}, config };
      err.config = config;
      throw err;
    }
    return { data, status, statusText: "", headers: {}, config };
  };
}

const t = (key: string) => `T(${key})`;

beforeEach(() => vi.clearAllMocks());

describe("field conflict reasons (B-102)", () => {
  it.each([
    ["user", "username", "username_taken", "This username is already taken"],
    ["user", "email", "email_taken", "This email is already taken"],
    ["user", "name", "duplicate_name", "You already have a player with this name"],
  ] as const)("(%s, %s) maps to %s and renders its locale key, not the server text", async (model, field, reason, serverText) => {
    expect(fieldConflictReason(model, field)).toBe(reason);
    answer(409, { available: false, message: serverText });
    const conflict = await checkFieldConflict(model, field, "x");
    expect(conflict).toEqual({ reason, message: serverText });
    expect(fieldConflictText(conflict, t)).toBe(`T(${FIELD_CONFLICT_KEYS[reason]})`);
    expect(FIELD_CONFLICT_KEYS[reason]).toBe(`common.fieldConflict.${reason}`);
  });

  it("an unknown pair falls back to the server's text", async () => {
    expect(fieldConflictReason("club", "name")).toBeNull();
    answer(409, { available: false, message: "Something the client does not know" });
    const conflict = await checkFieldConflict("club", "name", "x");
    expect(conflict).toEqual({ reason: null, message: "Something the client does not know" });
    expect(fieldConflictText(conflict, t)).toBe("Something the client does not know");
  });

  it("an available value is no conflict, and checkFieldAvailable keeps its old contract", async () => {
    answer(200, { available: true });
    expect(await checkFieldConflict("user", "email", "x")).toBeNull();
    expect(fieldConflictText(null, t)).toBeNull();
    answer(409, { available: false, message: "This email is already taken" });
    expect(await checkFieldAvailable("user", "email", "x")).toBe("This email is already taken");
  });
});
