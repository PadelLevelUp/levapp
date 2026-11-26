import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as availabilityApi from "./availability";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = { getToken: vi.fn(async () => null), setToken: vi.fn(async () => {}), removeToken: vi.fn(async () => {}) };

function installSingleton(data: unknown = {}) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: "", headers: {}, config };
  };
  return seen;
}

beforeEach(() => vi.clearAllMocks());

describe("a block save answers the classes it marked (PAD-772, calendar.student-blockers rule 21)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-23] a block save keeps the answer's markedClasses; the question's two calls are gone from the client", async () => {
    const marked = [{ model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "a", end: "b" }];
    const seen = installSingleton({ id: 1, markedClasses: marked, coveredClasses: [] });
    const saved = await availabilityApi.createBlocker({ date: "2026-12-02", startTime: "08:00", endTime: "09:00", isRecurring: false });
    expect(saved.markedClasses).toEqual(marked);
    expect(seen[0].url).toBe("/app/availability_blockers");

    installSingleton({ id: 1, markedClasses: [] });
    expect((await availabilityApi.updateBlocker(1, { date: "2026-12-02", startTime: "08:00", endTime: "09:00", isRecurring: false })).markedClasses).toEqual([]);

    // The server keeps decline_covered and the schedule read for older builds; this client never calls them.
    expect(Object.keys(availabilityApi)).not.toContain("declineCoveredClasses");
    expect(Object.keys(availabilityApi)).not.toContain("readScheduleCoveredClasses");
  });
});
