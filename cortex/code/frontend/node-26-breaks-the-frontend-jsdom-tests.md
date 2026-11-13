---
about: "Node 25+ defines a global localStorage that is undefined without --localstorage-file; frontend unit tests fail on it, so run them on Node 24.15.0"
permanence: changing
verified: "2026-11-13 (observed)"
origin:
  - commit:0d63c0e14
aliases:
  - PAD-930
need:
  - .githooks/prepush-gate.sh
  - .nvmrc
  - .github/workflows/checks-frontend.yaml
---

# Node 26 breaks the frontend jsdom tests

**What:** Node 25 and newer define a global `localStorage` (Web Storage). Without `--localstorage-file`
it warns and evaluates to `undefined`. The frontend unit tests (jsdom) then fail with
`localStorage.getItem` / `removeItem` TypeErrors that no code change causes. I have not traced which
side (Node's global or vitest's jsdom environment) wins the global; the failure on Node 26 and the pass
on 24.15.0 are what was observed.

**Observed (2026-11-12/13):** `node -e` on Homebrew Node 26.13.0 printed "ExperimentalWarning: localStorage is not available because --localstorage-file was not provided" and `localStorage.getItem` threw; on 24.15.0 `typeof localStorage` is "undefined" with no warning. The 2026-11-12 gate run on Node 26 failed on `localStorage.removeItem` TypeErrors; the same suite passed on 24.15.0 (web 1256, packages 1222, mobile 1394, admin 83).

**Why it bit:** Homebrew's `node` (26.x) is first on `PATH` here and nvm holds only 18.20.8 and 24.15.0.
The gate only refused Node below 22 and its `nvm use 22` did nothing, so it ran `npm test` on 26.

**How to apply:**
- Run every frontend command on Node 24.15.0 (CI's version): `nvm use 24.15.0`, or
  `export PATH=~/.nvm/versions/node/v24.15.0/bin:$PATH`. `.nvmrc` at the repo root says so.
- A localStorage TypeError in a frontend test on a clean tree means check `node -v` first.
- The pre-push gate refuses Node 25+ and prints the fix (spec `delivery.pre-push-gate`, PAD-930).
