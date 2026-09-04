import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for the Expo shell (apps/mobile). Sibling of vitest.packages.config.ts
// at the repo root: a plain Node environment, no Metro, no bundler, no simulator.
//
// React Native is never transformed. `react-native` is aliased to a small hand-written
// stub (src/test/mocks/react-native.ts) so a module under test can import Keyboard /
// Platform without dragging the RN jest preset — and react-native's Flow sources —
// into vitest. The alias matches `react-native` exactly (and `react-native/…`), so
// react-native-svg, react-native-safe-area-context et al. resolve normally.
//
// Scope is deliberately narrow: pure modules and hooks that render nothing. Component
// rendering stays out — @testing-library/react-native needs the real react-native
// package, which is precisely what the alias removes. Screens remain Maestro's job.
export default defineConfig({
  test: {
    name: "mobile",
    environment: "node",
    // `app/` too: Expo Router screens live there, and so will the helpers a
    // screen-level sweep wants to pin.
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "src/test/mocks/react-native.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
