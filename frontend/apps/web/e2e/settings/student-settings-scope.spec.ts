/**
 * PAD-103 — the Settings screen must offer a student only student-relevant
 * sections, and the coach-only endpoints behind the hidden sections must reject
 * a student caller with 403.
 *
 * Two halves, deliberately:
 *
 *   * the UI half (sections gone / still there) is cosmetic — it proves the
 *     student is not *invited* into the coach's configuration;
 *   * the HTTP half is the actual security boundary. Before PAD-103 these
 *     routes resolved the acting coach with the nullable `current_coach()` and
 *     dereferenced it, so a student caller got a 500 from an unhandled
 *     `AttributeError` rather than a deliberate 403. The status codes below are
 *     asserted exactly for that reason: `not 200` would have passed against the
 *     broken code.
 *
 * The exhaustive endpoint matrix lives in the backend suite
 * (`padel_app/tests/test_settings_role_authz.py`); this spec pins the same
 * contract end-to-end against the running stack.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  loginAsStudent,
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_ROOT } from "../helpers/api";

const API_BASE = `${API_ROOT}/app`;

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const COACH_ONLY_TABS = ["calendar", "notifications", "import", "club"] as const;
const SHARED_TABS = ["profile", "preferences", "account"] as const;

// ---------------------------------------------------------------------------
// UI — what each role is offered
// ---------------------------------------------------------------------------

test.describe("PAD-103: student settings surface", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    // The student has no Settings item in the sidebar (`roles: ["coach"]` in
    // AppLayout), but /settings is directly navigable and the avatar dropdown
    // links to it — which is exactly how the reported leak was reached.
    await openSettings(page);
  });

  test("PAD-103: student is not bounced off /settings", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings$/);
    for (const tab of SHARED_TABS) {
      await expect(page.getByTestId(`settings-nav-${tab}`)).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("PAD-103: coach-only sections are not offered to a student", async ({
    page,
  }) => {
    await expect(page.getByTestId("settings-nav-profile")).toBeVisible({
      timeout: 10_000,
    });
    for (const tab of COACH_ONLY_TABS) {
      await expect(page.getByTestId(`settings-nav-${tab}`)).toHaveCount(0);
    }
  });

  test("PAD-103: seasons, skill levels and evaluation categories are absent", async ({
    page,
  }) => {
    await page.getByTestId("settings-nav-preferences").click();

    // Language + theme are per-user and stay.
    await expect(page.locator("#language-select")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#theme-select")).toBeVisible();

    // The three coach-only blocks named in the ticket.
    await expect(
      page.getByRole("heading", { name: /coach levels/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /evaluation categories/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^seasons$/i })).toHaveCount(0);
  });
});

test.describe("PAD-103: coach settings surface is unchanged", () => {
  test("PAD-103: coach still gets every section", async ({ page }) => {
    await loginAsCoach(page);
    await openSettings(page);

    for (const tab of [...SHARED_TABS, ...COACH_ONLY_TABS]) {
      await expect(page.getByTestId(`settings-nav-${tab}`)).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("PAD-103: coach still manages skill levels, categories and seasons", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openSettings(page);

    await page.getByTestId("settings-nav-preferences").click();
    await expect(
      page.getByRole("heading", { name: /coach levels/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /evaluation categories/i }),
    ).toBeVisible();

    await page.getByTestId("settings-nav-calendar").click();
    await expect(
      page.getByRole("heading", { name: /^seasons$/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// HTTP — the actual authorization boundary
// ---------------------------------------------------------------------------

const COACH_ONLY_ENDPOINTS: Array<{
  label: string;
  method: "get" | "post";
  path: string;
  body?: unknown;
}> = [
  { label: "read skill levels", method: "get", path: "/coach_levels" },
  {
    label: "read evaluation categories",
    method: "get",
    path: "/evaluation_categories",
  },
  { label: "read seasons", method: "get", path: "/seasons" },
  { label: "read coach identity", method: "get", path: "/coach" },
  { label: "read import history", method: "get", path: "/import/history" },
  {
    label: "write skill levels",
    method: "post",
    path: "/add_coach_level",
    body: [{ code: "X1", label: "Injected", displayOrder: 1 }],
  },
  {
    label: "write evaluation categories",
    method: "post",
    path: "/add_evaluation_categories",
    body: [{ name: "Injected", scaleMin: 1, scaleMax: 5 }],
  },
  {
    label: "write seasons",
    method: "post",
    path: "/add_seasons",
    body: [{ name: "Injected", startDate: "2031-01-01", endDate: "2031-06-30" }],
  },
  {
    label: "delete a season",
    method: "post",
    path: "/delete/season",
    body: { id: 1 },
  },
  {
    label: "delete a skill level",
    method: "post",
    path: "/delete/coach_level",
    body: { id: 1 },
  },
  {
    label: "delete an evaluation category",
    method: "post",
    path: "/delete/evaluation_category",
    body: { id: 1 },
  },
  {
    label: "revert an import",
    method: "post",
    path: "/import/1/revert",
    body: {},
  },
  {
    label: "read the notification engine config",
    method: "get",
    path: "/notify/config",
  },
];

test.describe("PAD-103: coach-only endpoints reject a student", () => {
  for (const ep of COACH_ONLY_ENDPOINTS) {
    test(`PAD-103: student gets 403 — ${ep.label} (${ep.method.toUpperCase()} ${ep.path})`, async ({
      request,
    }) => {
      const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
      const res =
        ep.method === "get"
          ? await request.get(`${API_BASE}${ep.path}`, { headers: bearer(token) })
          : await request.post(`${API_BASE}${ep.path}`, {
              headers: bearer(token),
              data: ep.body ?? {},
            });

      expect(
        res.status(),
        `${ep.method.toUpperCase()} ${ep.path} must be 403 for a student ` +
          "(500 means the role was never checked)",
      ).toBe(403);
    });
  }
});

test.describe("PAD-103: the coach keeps their access", () => {
  test("PAD-103: coach still reads levels, categories and seasons over HTTP", async ({
    request,
  }) => {
    const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    for (const path of [
      "/coach_levels",
      "/evaluation_categories",
      "/seasons",
      "/coach",
      "/import/history",
      "/notify/config",
    ]) {
      const res = await request.get(`${API_BASE}${path}`, {
        headers: bearer(token),
      });
      expect(res.status(), `GET ${path} for a coach`).toBe(200);
    }
  });
});

test.describe("PAD-103: per-user settings stay open to students", () => {
  test("PAD-103: student can still read and update their own profile", async ({
    request,
  }) => {
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);

    const me = await request.get(`${API_ROOT}/auth/me`, {
      headers: bearer(token),
    });
    expect(me.status()).toBe(200);
    expect((await me.json()).roles).toContain("player");

    // The seed pins the E2E users to `en`; re-asserting it keeps this spec from
    // leaking a locale change into the shared seed DB.
    const patched = await request.patch(`${API_ROOT}/auth/me`, {
      headers: bearer(token),
      data: { language: "en" },
    });
    expect(patched.status()).toBe(200);
  });
});
