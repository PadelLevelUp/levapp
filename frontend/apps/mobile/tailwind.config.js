/* eslint-disable @typescript-eslint/no-var-requires */
// @levelup/config ships raw TypeScript (main: src/index.ts), so load it
// through jiti (bundled with tailwindcss) to transpile on the fly.
const jiti = require("jiti")(__filename, { interopDefault: true });
const { nativewindTheme, radius } = jiti("@levelup/config");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: nativewindTheme("light"),
      // NativeWind v3 can't evaluate calc()/var() — precompute literals
      // mirroring apps/web/tailwind.config.ts (var(--radius) = 0.625rem).
      borderRadius: {
        lg: radius,
        md: "0.5rem", // var(--radius) - 2px
        sm: "0.375rem", // var(--radius) - 4px
      },
    },
  },
  plugins: [],
};
