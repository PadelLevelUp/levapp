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
      borderRadius: {
        lg: radius,
        md: "calc(0.625rem - 2px)",
        sm: "calc(0.625rem - 4px)",
      },
    },
  },
  plugins: [],
};
