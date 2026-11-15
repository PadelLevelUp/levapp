---
about: "Mobile player screen: the contact rows printed hard-coded \"Email:\" / \"Phone:\" with a \"—\" fallback, English on a Portuguese screen"
permanence: stable
verified: "2026-10-22 (observed)"
origin:
  - migrated:compass/bugs/B-603-mobile-player-contact-labels-hard-coded-english.md@ef7a5f3
need:
  - "frontend/apps/mobile/app/player/[playerId].tsx"
  - frontend/apps/mobile/src/features/players/player-contact-rows.tsx
aliases:
  - B-603
  - B-603-mobile-player-contact-labels-hard-coded-english
---

# B-603: hard-coded English contact labels on the mobile player screen

**Source:** the Play Store screenshot job (PAD-608, run 39732375691, shot 04). The player screen's
Informação card read "Email: demo3@example.pt" and "Phone: —" in a pt build.

**Root cause:**
- `app/player/[playerId].tsx` printed the two labels as literals, outside `t()`, with "—" for an
  empty value.
- The web card (`PlayerInfoCard.tsx`) already showed an icon and `players.noEmail` /
  `players.noPhone`. The port missed it, and no criterion or test asked for translated contact rows
  on mobile.

**Fix (PAD-731):**
- `PlayerContactRows` renders the web shape: Ionicons `mail-outline` / `call-outline`, then the value
  or the shared empty keys. No new keys; web is unchanged.
- `player-contact-rows.test.tsx` checks:
  - the values;
  - the translated fallbacks;
  - that the screen renders the component and has no `>Email:` / `>Phone:` literal left. That
    check fails on staging before the fix: 2 matches.

**Ticket:** PAD-731.

<!-- 3.x fields of compass/bugs/B-603-mobile-player-contact-labels-hard-coded-english.md, carried verbatim by cortex migrate -->
```yaml
type: missing-criterion
severity: low
status: resolved
resolved: "2026-10-22"
affects:
  - "frontend/apps/mobile/app/player/[playerId].tsx"
  - frontend/apps/mobile/src/features/players/player-contact-rows.tsx
proposed_fix: "Render the rows as the web card does: an icon, then the value or players.noEmail / players.noPhone (shared keys, already translated)."
```
