import { describe, it, expect, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import { getConversations } from "./messages";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

function installSingleton() {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data: { conversations: [], hasMore: false }, status: 200, statusText: "", headers: {}, config };
  };
  return seen;
}

// messaging.conversations rule 17 (PAD-648): "Não lidas" is asked of the server.
describe("getConversations", () => {
  it("asks for the unread conversations only when the filter is on", async () => {
    const seen = installSingleton();
    await getConversations(2, 20, true);
    await getConversations(1, 20);
    expect(seen[0].params).toEqual({ page: 2, limit: 20, unread: 1 });
    expect(seen[1].params).toEqual({ page: 1, limit: 20 });
  });
});
