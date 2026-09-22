import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import { transform } from "esbuild";

function rnPrimitivesJsx(): Plugin {
  return {
    name: "rn-primitives-jsx",
    enforce: "pre",
    async transform(code, id) {
      if (!/node_modules\/@rn-primitives\/.*\.m?js$/.test(id)) return null;
      const out = await transform(code, { loader: "jsx", jsx: "automatic", sourcefile: id });
      return { code: out.code, map: out.map || null };
    },
  };
}

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
  // `@rn-primitives/*` ships RAW JSX in its .js/.mjs files (Metro transforms them for the app).
  // vite's import analysis runs before esbuild and rejects it, so a small plugin transforms
  // those files first; `deps.inline` below makes vitest process them at all (PAD-393).
  esbuild: { jsx: "automatic" },
  plugins: [rnPrimitivesJsx()],
  test: {
    server: { deps: { inline: [/@rn-primitives\//] } },
    name: "mobile",
    environment: "node",
    // `app/` too: Expo Router screens live there, and so will the helpers a
    // screen-level sweep wants to pin.
    // *.test.tsx mounts a component through src/test/render-native.tsx (PAD-393).
    include: ["src/**/*.test.ts", "app/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "src/test/mocks/react-native.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
