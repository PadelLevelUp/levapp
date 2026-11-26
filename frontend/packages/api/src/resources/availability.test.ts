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

describe("the covered-classes calls (PAD-772, calendar.student-blockers rules 19, 22)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-23] a block save keeps the answer's coveredClasses; the mark and the schedule read go to their routes", async () => {
    const covered = [{ model: "Lesson", originalId: 7, date: "2026-12-02", title: "Quarta", start: "a", end: "b" }];
    installSingleton({ id: 1, coveredClasses: covered });
    const saved = await availabilityApi.createBlocker({ date: "2026-12-02", startTime: "08:00", endTime: "09:00", isRecurring: false });
    expect(saved.coveredClasses).toEqual(covered);

    let seen = installSingleton({ declined: [], skipped: [] });
    await availabilityApi.declineCoveredClasses({ occurrences: [{ model: "Lesson", originalId: 7, date: "2026-12-02" }] });
    expect(seen[0].method?.toUpperCase()).toBe("POST");
    expect(seen[0].url).toBe("/app/availability_blockers/decline_covered");
    expect(JSON.parse(seen[0].data)).toEqual({ occurrences: [{ model: "Lesson", originalId: 7, date: "2026-12-02" }] });

    seen = installSingleton({ coveredClasses: covered });
    const read = await availabilityApi.readScheduleCoveredClasses("sched/1", { title: null, blockers: [] });
    expect(seen[0].method?.toUpperCase()).toBe("POST");
    expect(seen[0].url).toBe("/app/availability_schedules/sched%2F1/covered_classes");
    expect(read).toEqual(covered);
  });
});
