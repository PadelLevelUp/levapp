# LevelUp Frontend Monorepo

npm workspaces monorepo (this repo uses **npm**, not pnpm): two app shells sharing a platform-agnostic core.

```
apps/web/         # React + Vite + Tailwind + shadcn/ui (port 8080), Playwright E2E in apps/web/e2e/
apps/mobile/      # Expo + Expo Router + NativeWind + react-native-reusables, Maestro E2E in .maestro/
packages/
  types/          # @levelup/types — shared TS types
  api/            # @levelup/api — typed axios client (initApi/getApi)
  hooks/          # @levelup/hooks — TanStack Query hooks
  validation/     # @levelup/validation — Zod schemas
  config/         # @levelup/config — shared constants
```

## Node version

Use **Node 24.15.0** via nvm: `nvm use 24.15.0` before any install/build/run.

## Commands (repo root)

```bash
npm install                       # workspaces install
npm run dev                       # web dev server (Vite, port 8080)
npm run mobile                    # mobile: expo start
npm run mobile:ios                # mobile: expo run:ios (build + install dev client)
npm test                          # web unit tests + packages tests (vitest)
npm run test:packages             # packages/* unit tests only
npm run test:e2e:headless         # web Playwright E2E (headless)
bash apps/mobile/scripts/e2e.sh   # mobile Maestro E2E (see apps/mobile/README.md for setup)
```

## Hard rule: packages/* stay platform-agnostic

Nothing in `packages/*` may import React DOM, React Native, Expo, or browser/native globals. Platform concerns are **injected by the shells**:

- `@levelup/api` — `initApi({ baseURL, storage })`: the web shell injects its base URL + localStorage-backed `TokenStorage`; mobile injects `EXPO_PUBLIC_API_URL`/`src/lib/config.ts` + a SecureStore adapter (`apps/mobile/src/lib/api.ts`).
- Anything needing storage, navigation, or platform APIs belongs in the shell, not the package.

## Mobile app

See `apps/mobile/README.md` for run instructions, E2E setup (test backend :5001, Metro :8081, pinned simulator), and the web→Maestro coverage map. Key points:

- API base URL: `apps/mobile/src/lib/config.ts` — defaults to `http://localhost:5001/api`, override with `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:5000/api` for the dev backend).
- Maestro flow docs and gotchas (Select portals invisible to iOS a11y, no unbounded `eraseText`, non-inverted FlatList): `apps/mobile/.maestro/README.md`.
- Backend endpoint surface: `apps/mobile/API-CONTRACT.md`.
- Push notifications are scaffolded but stubbed (`PUSH_TOKEN_ENDPOINT = null` in `apps/mobile/src/lib/push/expoPushRegistrar.ts`) until the backend grows a native token endpoint.

## Metro monorepo config

`apps/mobile/metro.config.js` watches the workspace root so raw-TS `@levelup/*` packages resolve and hot-reload, resolves `node_modules` app-first then root, pins `react`/`react-native`/`react-native-css-interop` as singletons to the app's copy (the web app hoists React 18 to the root), and handles the `@/` → `src/` alias itself (`tsconfigPaths` is disabled in `app.json`). When adding a shared package, no Metro change is needed; when adding a dependency that must be a singleton, add it to the `singletons` list.
