import { expect, test as base } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SeededSession {
  token: string;
  expiresAt: string;
  role: string;
  email: string;
  roleId: number;
  pendingCoachIds: number[];
}

export function readSeededSession(): SeededSession {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, ".admin-session.json"), "utf8")) as SeededSession;
}

// A stand-in for Google Identity Services: it renders a 280 x 40 button in the slot, so a spec can
// assert the slot is on screen without loading anything from Google.
const GSI_STUB = `window.google = { accounts: { id: {
  initialize() {},
  disableAutoSelect() {},
  renderButton(parent) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Google";
    b.style.width = "280px";
    b.style.height = "40px";
    parent.appendChild(b);
  },
} } };`;

export const test = base.extend<{ googleStub: void; signedIn: SeededSession }>({
  // Every test: nothing is ever loaded from Google (rule 7).
  googleStub: [
    async ({ page }, use) => {
      await page.route(/accounts\.google\.com/, (route) => route.abort());
      await page.route(/accounts\.google\.com\/gsi\/client/, (route) =>
        route.fulfill({ contentType: "application/javascript", body: GSI_STUB })
      );
      await use();
    },
    { auto: true },
  ],
  // Opt-in: put the token minted by the backend's issuer in sessionStorage before the first navigation.
  signedIn: async ({ page }, use) => {
    const session = readSeededSession();
    await page.addInitScript(
      ({ token, email, role, roleId, expiresAt }) => {
        sessionStorage.setItem("levapp-admin-token", token);
        sessionStorage.setItem("levapp-admin-session", JSON.stringify({ email, role, roleId, expiresAt }));
      },
      session
    );
    await use(session);
  },
});

export { expect };
