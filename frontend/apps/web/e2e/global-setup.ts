import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
  const scriptsDir = path.resolve(__dirname, "scripts");
  console.log("[global-setup] Resetting test database…");
  execSync(`bash "${scriptsDir}/reset-test-db.sh"`, {
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("[global-setup] Test database ready.");
}
