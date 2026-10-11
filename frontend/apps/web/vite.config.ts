import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// `publicDir` is left at its default ("public"), which matters for more than
// favicons: `public/.well-known/apple-app-site-association` is what lets an
// invite link open the iOS app (PAD-184). Vite's public-dir copy walks
// `readdirSync` and so includes dot-directories verbatim — but setting
// `publicDir: false`, or moving the file, breaks universal links with no build
// error and no runtime symptom other than the link opening Safari.
// apps/web/src/test/apple-app-site-association.test.ts pins that; the
// application/json content type it also needs lives in apps/web/nginx.conf.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT ?? "5000"}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // client.route-loading rules 5 and 8 (PAD-585). Pages are lazy chunks (src/routes/lazyPages.ts);
  // these groups only keep slow-moving vendors in their own long-cached files. There is no
  // catch-all vendor chunk: that would put every library back in the first download. The
  // manifest feeds scripts/check-entry-budget.mjs.
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // A lazily loaded language is one chunk, not one per area file (rule 6).
          const locale = /\/src\/locales\/([^/]+)\/[^/]+\.json$/.exec(id);
          if (locale && locale[1] !== "pt") return `locale-${locale[1]}`;
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "vendor-react";
          if (id.includes("node_modules/@radix-ui/")) return "vendor-radix";
          if (/node_modules\/(i18next|react-i18next)\//.test(id)) return "vendor-i18n";
          return undefined;
        },
      },
    },
  },
}));
