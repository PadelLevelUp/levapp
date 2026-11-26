/**
 * classes.coach-requests-table rule 10 (PAD-795): one function names a (kind, status, decidedBy)
 * with the coach-side keys that exist today, plus the one proposed `declinedByStudent`.
 */
import { describe, expect, it } from "vitest";
import pt from "../../../src/locales/pt/classRequests.json";
import en from "../../../src/locales/en/classRequests.json";
import { coachRequestStatusKey } from "./class-request-status-key";

const PRIVATE_STATUSES = ["pending", "countered", "accepted", "declined", "withdrawn"] as const;
const ACADEMY_STATUSES = ["pending", "accepted", "rejected", "withdrawn", "superseded"] as const;
const DECIDERS = [null, "coach", "student"] as const;

const resolves = (bundle: typeof pt, key: string) => {
  const leaf = key.split(".").slice(1).reduce<any>((node, part) => node?.[part], bundle.classRequests);
  return typeof leaf === "string" && leaf.length > 0;
};

describe("coachRequestStatusKey (PAD-795 rule 10)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-11] every status maps to an existing coach-side key", () => {
    for (const decidedBy of DECIDERS) {
      for (const status of PRIVATE_STATUSES) {
        const key = coachRequestStatusKey("private", status, decidedBy);
        const expected =
          status === "declined" && decidedBy === "student"
            ? "classRequests.coachStatus.declinedByStudent"
            : `classRequests.coachStatus.${status}`;
        expect(key).toBe(expected);
        expect(resolves(pt, key), `pt ${key}`).toBe(true);
        expect(resolves(en, key), `en ${key}`).toBe(true);
      }
      for (const status of ACADEMY_STATUSES) {
        const key = coachRequestStatusKey("academy", status, decidedBy);
        expect(key).toBe(`classRequests.coachStatus.${status}`);
        expect(resolves(pt, key), `pt ${key}`).toBe(true);
        expect(resolves(en, key), `en ${key}`).toBe(true);
      }
    }
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-11] the proposed words for a proposal the student refused", () => {
    expect(pt.classRequests.coachStatus.declinedByStudent).toBe("Recusado pelo aluno");
    expect(en.classRequests.coachStatus.declinedByStudent).toBe("Declined by the student");
  });
});
