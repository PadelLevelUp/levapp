import { defineConfig } from "vitest/config";

// Unit tests for the shared workspace packages (packages/*). These run in a
// plain Node environment — no DOM, no React Native — proving the shared code
// is platform-neutral. The web app keeps its own vitest config in apps/web.
export default defineConfig({
  test: {
    name: "packages",
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
});
