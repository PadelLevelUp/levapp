import { defineConfig } from "vitest/config";

// Unit tests for the shared workspace packages (packages/*). These run in a
// plain Node environment — no DOM, no React Native — proving the shared code
// is platform-neutral. The web app keeps its own vitest config in apps/web.
export default defineConfig({
  test: {
    name: "packages",
    environment: "node",
    // .tsx too (B-127): a hook test renders and picks jsdom with its own
    // `// @vitest-environment jsdom` pragma. While only `.test.ts` was listed,
    // packages/hooks/src/useCalendarEvents.test.tsx was collected by no runner.
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
  },
});
