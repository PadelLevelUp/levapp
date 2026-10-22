import { defineConfig, type Plugin } from "vite";
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
/**
 * PAD-656 (auth.landing-page, Lighthouse): a visitor's `/` renders only after the entry script runs
 * and then fetches the site's lazy chunks — a second round trip that Lighthouse counted as 93% of
 * the LCP. At build time this finds the SitePage chunk and its static imports and adds an inline
 * script to index.html that, on `/` for a visitor with no stored token only, inserts
 * `<link rel="modulepreload">` for them, so they download alongside the entry. A signed-in user (or
 * any other path) downloads nothing extra.
 */
function sitePreload(): Plugin {
  return {
    name: "levapp-site-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = new Map<string, { imports: string[]; isEntry: boolean; facadeModuleId?: string | null }>();
        for (const [file, out] of Object.entries(bundle)) {
          if (out.type === "chunk") chunks.set(file, { imports: out.imports, isEntry: out.isEntry, facadeModuleId: out.facadeModuleId });
        }
        const entryDeps = new Set<string>();
        const walk = (file: string, into: Set<string>) => {
          if (into.has(file)) return;
          into.add(file);
          for (const dep of chunks.get(file)?.imports ?? []) walk(dep, into);
        };
        for (const [file, c] of chunks) if (c.isEntry) walk(file, entryDeps);
        const find = (suffix: string) => [...chunks].find(([, c]) => c.facadeModuleId?.endsWith(suffix))?.[0];
        const closure = (file: string | undefined) => {
          const out = new Set<string>();
          if (file) walk(file, out);
          return [...out].filter((f) => !entryDeps.has(f)).map((f) => `/${f}`);
        };
        const root = find("/src/site/SitePage.tsx");
        if (!root) return html;
        const shared = closure(root);
        // Each audience page is its own chunk; only the one in the URL is preloaded (rule 4's
        // aliases: ?para= first, then ?audience=; anything else is coaches).
        const pages: Record<string, string[]> = {};
        for (const [aud, suffix] of [["coaches", "/src/site/pages/CoachesPage.tsx"], ["players", "/src/site/pages/PlayersPage.tsx"], ["others", "/src/site/pages/OthersPage.tsx"]] as const) {
          pages[aud] = closure(find(suffix)).filter((f) => !shared.includes(f));
        }
        const script = `<script>(function(){try{if(location.pathname!=="/"||localStorage.getItem("accessToken"))return;var q=new URLSearchParams(location.search);var v=(q.get("para")||q.get("audience")||"").toLowerCase();var a={treinadores:"coaches",coaches:"coaches",jogadores:"players",alunos:"players",players:"players",outros:"others",others:"others"}[v]||"coaches";var p=${JSON.stringify(
          pages,
        )};${JSON.stringify(shared)}.concat(p[a]||[]).forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=h;document.head.appendChild(l);});}catch(e){}})();</script>`;
        return html.replace("</head>", `    ${script}\n  </head>`);
      },
    },
  };
}

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
    sitePreload(),
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
