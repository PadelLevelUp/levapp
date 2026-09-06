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
      // Mirrors apps/web/tailwind.config.ts. The faces are loaded in
      // app/_layout.tsx via expo-font; these names must match the
      // PostScript names those modules register.
      // React Native does not synthesize weights for a custom family, so each
      // weight is its own registered face and needs its own utility. The keys
      // must NOT be `medium`/`semibold`/`bold`: Tailwind would emit
      // `.font-semibold` as a FAMILY utility and collide with the built-in
      // font-WEIGHT utility of the same name.
      //
      // You do NOT have to write these names by hand (PAD-156, compass R-025).
      // A bare `font-semibold` is inert on its own — it sets fontWeight on a
      // one-face family and renders Regular — so `resolveFontClass`
      // (src/lib/font-class.ts) maps the standard Tailwind weight names onto
      // the faces below, and every component that renders text applies it.
      // Add a new face here and it also needs a branch there.
      fontFamily: {
        sans: ["PlusJakartaSans_400Regular"],
        "sans-medium": ["PlusJakartaSans_500Medium"],
        "sans-semibold": ["PlusJakartaSans_600SemiBold"],
        "sans-bold": ["PlusJakartaSans_700Bold"],
        display: ["Poppins_700Bold"],
        "display-semibold": ["Poppins_600SemiBold"],
      },
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
