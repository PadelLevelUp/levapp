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
      // NativeWind/react-native-css-interop can't resolve calc() into a
      // numeric borderRadius on native (it silently no-ops), so these are
      // precomputed literals mirroring apps/web/tailwind.config.ts's
      // `calc(var(--radius) - Npx)` — radius is 0.625rem (10px).
      borderRadius: {
        lg: radius, // 0.625rem = 10px
        md: "0.5rem", // 10px - 2px = 8px
        sm: "0.375rem", // 10px - 4px = 6px
      },
    },
  },
  plugins: [],
};
