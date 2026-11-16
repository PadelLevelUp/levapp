import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * classes.class-requests rule 4a (B-729): both iOS request screens read a refused accept's clash lines from
 * @levelup/config classRequestRefusalLines before the `classRequests.refusal.<code>` key, which has no
 * `busy_same_hour`. The lines and their words are pinned in the helper's test (CLASSES-CLASS-REQUESTS-40).
 * Source-reading: app/ screens mount hooks, and a test file under app/ would break Metro.
 */
const SECTION = readFileSync(resolve(__dirname, "class-requests-section.tsx"), "utf8");
const CONVERSATION = readFileSync(resolve(__dirname, "../../..", "app/conversation/[id].tsx"), "utf8");

describe("the iOS request screens name the clash (rule 4a)", () => {
  it("[CLASSES-CLASS-REQUESTS-42] both iOS request screens read the clash lines first", () => {
    expect(SECTION).toMatch(/classRequestRefusalLines\(err, role, i18n\.language\)[\s\S]{0,200}classRequestsApi\.classRequestRefusal\(err\)/);
    expect(CONVERSATION).toMatch(
      /classRequestRefusalLines\(err, studentAnswers \? "student" : "coach", i18n\.language\)[\s\S]{0,300}classRequestsApi\.classRequestRefusal\(err\)/
    );
  });
});
