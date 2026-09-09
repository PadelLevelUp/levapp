# LevApp Design System

The design language for **LevApp**, a padel/tennis academy app. Coaches run classes, fill
empty seats, track player progress and message players; players see their own classes and
progress.

The product was called **LevelUp** and some of the plumbing still is: the GitHub org
(`PadelLevelUp/levapp`) and the npm scope (`@levelup/*`). The user-facing names have
already moved — `frontend/apps/mobile/app.json:3` is `"name": "LevApp"` and
`frontend/apps/web/index.html:6` is `<title>LevApp</title>` (verified 2026-09-09). The two
repos merged into one monorepo on 2026-09-03: `levelup_frontend/` is now `frontend/`,
`levelup_backend/` is now `backend/`. Write **LevApp** in new user-facing copy, marks,
titles and docs, and leave code identifiers alone until someone asks for that migration.
"LevelUp" below always means the old name or the pre-2026-08-07 green product.

The organising job of the product is **communication with players** — filling classes and
chasing replies. Every decision below serves that.

---

## Sources and provenance

Be honest about where this came from, because it affects how much you should trust it.

| Source | What it gave us |
|---|---|
| A hand-drawn logo idea supplied by the user | The L+A monogram. Rebuilt as vector geometry in `assets/logo/`. |
| Screenshots of the current app (Painel, Calendário, Jogadores, player profile, Mensagens, Definições) | Screen inventory, Portuguese copy, real data shapes (Aula 5, Nível 4-, 12/16, 3230 validações pendentes). |
| `LevelUp Redesign Plan.dc.html` in this project | The palette, type, component language, calendar encoding and dark-mode rules codified here. (Filename keeps the old brand; it is a source artifact.) |

**No Figma file was provided, and nothing in `components/` or `ui_kits/` was read from
production source** — it was authored from the redesign plan. That was a warning when this
system was still a proposal. It no longer is: production adopted the palette wholesale on
2026-08-07 and now looks like this. The prototype files here lead the code in *vocabulary*,
not in colour. Read the next section before you write a line of production CSS.

---

## Production reality — verified 2026-09-09

**This section used to say the redesign did not ship. It does.** The claim was accurate
when written (2026-08-06) and went stale the next day: commits `9e38378` and `b362c58`,
both 2026-08-07, swapped the shared token layer to LevApp navy/blue and repainted
typography, primitives and chrome. Re-verified against `origin/staging` (`faab7eb`) on
2026-09-09.

The old table asserted a green primary and a test naming it "the padel court green".
Neither exists. What the code says now:

| Was claimed (stale) | Actually true (file:line) |
|---|---|
| Identity is green `152 60% 42%` | `frontend/packages/config/src/tokens.ts:78` — `primary: "220 84% 47%", // blue-600 #1355DC` |
| `tokens.test.ts` asserts primary is green | `frontend/packages/config/src/tokens.test.ts:45-48` asserts it is **blue**; `:55-62` asserts green is `success` and *never* primary |
| Web ships a green shadcn palette | `frontend/apps/web/src/index.css:31,61` — `--primary: 220 84% 47%`, `--success: 161 78% 33%` |
| Green is `--primary` *and* `--success` | Green is `--success` only. Rule 3 below now holds in production too. |
| No navy hex anywhere | `index.css:71` `--sidebar-background: 217 58% 12%` (navy-800); `frontend/apps/web/src/pages/LandingPage.tsx:66` uses the exact hero gradient `linear-gradient(150deg, #16294A 0%, #0B1524 100%)` |

The mapping is essentially 1:1. Converting production's HSL triplets back to hex gives this
skill's ramp, within the ~1/255 that an HSL round-trip costs:

| Production token | Renders | This skill |
|---|---|---|
| `--primary` `220 84% 47%` | `#1356DD` | `--lv-blue-600 #1355DC` |
| `--background` `216 29% 93%` | `#E8ECF2` | `--lv-grey-150 #E9EDF3` |
| `--foreground` `216 52% 13%` | `#101E32` | `--lv-grey-800 #101E33` |
| `--destructive` `4 63% 53%` | `#D3463C` | `--lv-red-600 #D3453B` |
| `--success` `161 78% 33%` | `#13966C` | `--lv-green-600 #12946B` |
| `--warning` `31 72% 50%` | `#DB8324` | `--lv-amber-600 #D98324` |
| `--private` `249 55% 59%` | `#6E5DD0` | `--lv-violet-600 #6D5BD0` |
| `--academy` / `--info` `214 100% 59%` | `#2E89FF` | `--lv-blue-500 #2F8AFF` |
| `--sidebar-background` `217 58% 12%` | `#0D1A30` | `--lv-navy-800 #0D1B31` |

Dark mode matches `tokens/dark.css` value-for-value: `#070E1A` page, `#0F1B2E` card,
`#17273F` raised, `#1E3453` accent wash, `#5FD3AC` done, `#F0B970` attention, `#B3A6F5`
progress (`index.css:82-127`).

**What still differs is the vocabulary, and only that:**

| | This skill | Production |
|---|---|---|
| Token form | `--lv-blue-600: #1355DC`, read as `var(--lv-*)` | `--primary: 220 84% 47%`, read as `hsl(var(--primary))` or a Tailwind class |
| Names available | full ramp + `--surface-*` / `--text-*` / `--action-*` / `--status-*` aliases | shadcn set only: `primary`, `muted-foreground`, `border`, `card`, `destructive`, `academy`, `private`, `success`, `warning`, `info`, plus `success-strong` / `warning-strong` |
| Tints | one token per tint (`--status-done-bg`) | opacity modifiers — `bg-success/15`, `bg-primary/10` |
| Dark selector | `[data-theme="dark"]` | `.dark` class (`tailwind.config.ts:4`) |
| Source of truth | `tokens/*.css` here | `frontend/apps/web/src/index.css` (`@layer base`), mirrored in `frontend/packages/config/src/tokens.ts` for mobile via `nativewindTheme()` |
| Components | plain `.jsx` in `components/` | shadcn/ui + Tailwind in `frontend/apps/web/src/components/ui/` |

**So:**

- **Prototypes, mocks, slides, throwaway artifacts** → use this system freely, `--lv-*`
  names and all.
- **Production code** → same colours, different names. `bg-primary`, not
  `var(--lv-blue-600)`. `bg-success/15 text-success-strong`, not `--status-done-bg`. There
  is no production token for `--lv-blue-200` or `--surface-sunken`; use the nearest shadcn
  token or an opacity modifier rather than adding one.
- **Never hand-copy a hex** from `tokens/colors.css` into production. The rounding above
  means you would be hardcoding a near-miss of a token that already exists.

**Changing a production colour is a two-file edit.** `frontend/packages/config/src/tokens.ts`
feeds mobile through `nativewindTheme()` (`frontend/apps/mobile/tailwind.config.js:5,13`);
`frontend/apps/web/src/index.css` feeds the web. Nothing syncs them at runtime — only
`tokens.test.ts:105-153`, which fails the build on drift and also forbids declaring tokens
outside `@layer base` (an unlayered `:root` block once silently overrode `--warning`).

---

## Content fundamentals

**Language.** Portuguese (pt-PT), the language of the existing product. Copy from the
current app is kept verbatim: *Painel, Calendário, Jogadores, Treino, Mensagens,
Definições, Aula 5, Nível 4-, Adicionar avaliação*. Never use Brazilian forms.

In **prototypes**, write pt-PT strings inline. In **production**, the app is fully
i18n'd — strings live in `frontend/src/locales/{pt,en}/*.json` (the **frontend root**
tree, not `apps/web/src/`; `frontend/apps/web/src/i18n.ts:21` globs
`../../../src/locales/*/*.json`)
and go through `t()`. `pt` is both default and fallback (PAD-39), so English *does* exist
there: add the key to both files, and never hardcode a visible string in a component. The
rules below are rules for the pt copy, which is the copy that defines the voice.

**Person.** Address the coach as **tu**, informally — "tens vaga", "passa a ti",
"Depois disso passa a ti". Never *você*, never the impersonal infinitive. The product
speaks like a colleague at the club, not like software.

**Register.** Plain and short. Labels are nouns or bare verbs:

- Titles: `Por resolver`, `Painel`, `Comunicação`, `Jogadores` — nouns, never sentences.
- Buttons: `Convidar 12 jogadores`, `Notificar`, `Rever`, `Depois`, `Abrir`, `Sair`.
  A button says what happens, with the number in it when there is one.
- States: `Concluída`, `Faltam 9`, `Sem conta`, `Sem resposta`, `Recusou`, `Em espera`.

**Numbers are the copy.** Prefer `7/16 inscritos` to "poucas inscrições",
`2 chamadas · há 3 dias` to "chased recently", `0 de 31 confirmadas` to "pending".
A count with a denominator beats an adjective every time. Dates are lowercase and
abbreviated in dense contexts (`qui 6 ago · 10:30`), spelled out in headers
(`terça, 4 agosto`). Times are 24-hour.

**Separators.** A middle dot with spaces joins facts on one line:
`10:30 – 12:00 · Nível 3 · Campo 2`. Never commas, never pipes.

**Message templates** show their placeholders literally, in braces, because the coach
edits them as text: `Olá {nome}, tens vaga para a aula de {nível} {dia} às {hora}.`

**No emoji.** Not in UI, not in copy, not in automated messages. The only glyphs used as
symbols are `✓` (attendance/completion), `←` (back) and `+` (add).

**Empty states state the fact and stop**: `Ninguém neste filtro.` No illustration, no
encouragement, no exclamation marks.

---

## Visual foundations

*Everything in this section applies as written to prototypes, artifacts **and**
production — production adopted this palette on 2026-08-07. The only translation needed in
production code is the token vocabulary (`bg-primary`, not `var(--action-primary)`); see
Production reality above.*

### Colour
The palette comes out of the app icon: a navy field with a blue gradient. Blue carries
identity **and** every primary action. Tokens in `tokens/colors.css`.

- **Ink/navy** `#0B1524` → `#0D1B31` — the darkest surfaces, the icon field, the
  "next class" hero, avatars for the signed-in coach.
- **Blue** `#1355DC` primary, `#2F8AFF` accent, `#4A9BFF` on dark, `#E8F1FF` wash.
- **Cool greys only.** `#F6F8FB` → `#101E33`, all tuned toward the navy. A warm grey
  reads as a bug in this system.
- **Status colours have exactly one job each.** Green `#12946B` = done/confirmed.
  Amber `#D98324` = needs the coach. Red `#D3453B` = problem/destructive.
  Violet `#6D5BD0` = player-side, level, progress, non-class events.

The old brand green survives only as "done", in production as well as here — a test
(`frontend/packages/config/src/tokens.test.ts:55-62`) now enforces it. That demotion is the
point: because green means one thing, a green badge is informative. Never pick a status colour for
visual variety, and never colour something by category (class level is a *chip*, not a
colour).

Maximum two background colours on a screen: the page grey and white cards, or navy and
its raised tints in dark mode.

### Type
Two families, both from Google Fonts. **⚠ Substitution:** no font binaries were supplied.
Poppins and Plus Jakarta Sans are the current choices; if LevApp licenses different
faces, swap the `@font-face` sources in `tokens/fonts.css` — token names don't change.

- **Poppins 700** — screen titles, hero numbers, the wordmark, the level chip on
  calendar blocks. `letter-spacing: -0.02em` on anything 20px+.
- **Plus Jakarta Sans** — everything else. 700 for row titles, 600 for buttons and
  labels, 400 for body and secondary lines.
- **Eyebrows** are uppercase, 12px, 600, `0.1em` tracking, tertiary grey. They open a
  group of rows and never compete with the screen title.
- **All times, scores and counts use `font-variant-numeric: tabular-nums`.**
  A column of proportional figures jitters and is unreadable at a glance.

### Space and shape
A 4pt spine: 4 / 8 / 12 / 16 / 24 / 32 / 48. Radii rise with the size of the thing —
6px chips, 10–12px controls and calendar blocks, 16–20px cards, 36px sheets and the
phone frame, `999px` pills. The iOS icon uses the platform squircle (`--radius-app-icon`),
never a hand-rolled radius.

Touch targets are 44px minimum. Desktop-dense rows may use 34px controls; mobile may not.

### Surfaces, borders, elevation
Cards are white with a 1px `--border-subtle` outline and **no shadow**. One shadow
family exists and it is reserved for things that genuinely float: sheets, popovers,
the device frame. A list of shadowed cards is the single most common way to make this
system look wrong.

Where a background tint already separates a group (sunken grey, blue wash), the card
drops its outline. Row groups are built as a 1px-gap flex stack on a `--border-subtle`
background, so the hairlines are gaps, not borders.

The only decorative device is the **4px left accent bar**, and it means exactly one
thing: *this item is waiting on you*. It belongs to the action queue. Do not use it as
category colour — the "rounded card with a coloured left border" pattern is otherwise
banned here.

### Gradients, transparency, blur
Exactly one gradient: the navy hero, `linear-gradient(150deg, #16294A, #0B1524)`, used
for the next-class card, sheet headers, and the icon field. The blue gradient exists
only inside the logo mark. No other gradients anywhere — no gradient buttons, no
gradient text.

Transparency is used for two things: white at 14–28% for tracks and rings on navy, and
status colours at 18–22% for badge fills in dark mode. No frosted glass, no backdrop
blur. Scrims are flat `rgba(11,21,36,0.45)`.

### Motion
Restrained. 120ms for control colour changes, 180ms default, 280ms for width and
progress. `cubic-bezier(0.2, 0, 0, 1)` standard, `cubic-bezier(0.16, 1, 0.3, 1)` for
things entering. Fades and small translations only — **nothing bounces, nothing
springs, nothing overshoots.** Progress bars animate their width; that is the most
expressive the system gets. All durations collapse to 0 under
`prefers-reduced-motion`.

### Interaction states
- **Hover** (desktop only): primary buttons darken to `--action-primary-hover`;
  secondary and ghost take a one-step-darker background. Never opacity fades.
- **Press**: the background darkens one more step. No scale transforms.
- **Focus**: `--focus-ring`, a 3px blue halo. Never remove it.
- **Selected**: a filled shape, not a colour swap — the active tab gets a blue-wash
  rounded rectangle behind its icon; the active filter pill goes **navy**, not blue,
  because blue is reserved for actions.
- **Disabled**: 45% opacity, `not-allowed`.

### Imagery
There is none, and that is deliberate. Players are initials avatars; most have no
photo, so the system is designed for the no-photo case and treats a photo as the
exception. There are no illustrations, no stock photography, no empty-state art. If
imagery is ever introduced, it should be real photography of courts and play — cool,
slightly desaturated, never warm-filtered lifestyle stock.

### Layout
Mobile and desktop carry equal weight. Mobile: a single column, 20px gutters, a
six-destination bottom tab bar. Desktop: a 248px sidebar replacing the tab bar, content
capped at 1240px, two-pane for settings and player profile. The calendar is the one
view that is genuinely wider on desktop; everything else is the mobile column with more
air.

---

## Iconography

A thin **outline** set: 24px grid, 2px stroke, round caps, geometric, no fills. Resting
glyphs are `--text-tertiary`; the active destination is `--action-primary`. This matches
**Lucide**, which is the system's icon set — its geometry ships inline in
`components/core/Icon.jsx` (ISC licence), so glyphs inherit `currentColor` and theme
correctly in dark mode. No CDN, no icon font, no `<img>`.

Render every icon through `<Icon name="…" />`. Never inline an `<svg>` in a screen or a
component, and never hand-draw one — if a glyph is missing, take it from Lucide and add
it to `PATHS`.

Sizes: 20px in the tab bar, 16px inside buttons and rows, 24px standalone.

Three Unicode glyphs are also part of the system, used as symbols rather than icons:
`✓` (attended / completed / selected), `←` (back) and `+` (add).

**⚠ The mapping was read from a screenshot, not from source.** `assets/icons/README.md`
lists every glyph, its Lucide equivalent and how faithful it is. Two are outstanding:
**Treino** is a padel racket in the real app and currently carries a stand-in, and
**Definições** is a bespoke ringed-dot mark approximated with a crosshair. Send the real
SVGs and both are a one-line change.

## Index

```
styles.css                 ← the only entry point; @import list, nothing else
tokens/                    colors · typography · spacing · elevation · motion · dark · fonts
assets/logo/               icon, on-dark, on-light, mono marks + usage rules
guidelines/*.card.html     14 specimen cards (Colors, Type, Spacing, Brand)
components/core/           Button Badge Card Avatar+AvatarStack ProgressBar Toggle
                           Input SegmentedControl FilterPill Eyebrow Icon
components/app/            ScreenHeader StatCard ActionCard ClassBlock
                           PlayerRow MessageRow AutomationRow TabBar
ui_kits/coach-app/         click-through recreation — start at index.html
animations/                two launch-animation studies for the L+A mark
SKILL.md                   Agent Skills entry point
```

The production counterparts, for when you are writing real code:

```
frontend/apps/web/src/index.css            the shipping CSS variables (@layer base)
frontend/apps/web/tailwind.config.ts       how those become Tailwind class names
frontend/packages/config/src/tokens.ts     same tokens for mobile (nativewindTheme)
frontend/packages/config/src/tokens.test.ts the test that keeps those two in step
frontend/apps/web/src/components/ui/       shadcn primitives — reuse, don't re-author
frontend/src/locales/{pt,en}/              all user-facing strings (frontend root, NOT apps/web)
```

Each component directory holds `<Name>.jsx`, `<Name>.d.ts` (props contract and the
rules for using it) and `<Name>.prompt.md` (what it is, when to use it, a usage
example). **Read the `.prompt.md` before using a component** — most of the adherence
rules live there, not here.

### Intentional additions
No source defined a component inventory, so `components/core/` is a standard set sized
to this product. `components/app/` are domain primitives the redesign plan requires and
the current app has no equivalent for: `ActionCard`, `AutomationRow`, and the
five-status `ClassBlock`.

### Not built
Player-facing screens, the player profile (Progresso / Histórico tabs), the Treino
library, desktop two-pane layouts, and any slide or marketing surface — none of these are
built *in this kit*. Production has its own versions. The redesign's split — the player app
on the light theme with blue accents, coaches on the navy chrome — is a proposal about
this kit; check the real screens before assuming production follows it.

---

## Rules of thumb for anyone building here

1. One `primary` button per view.
2. A number never appears without a denominator or a direction.
3. Green means done. Amber means you. Nothing else.
4. Cards in a list have borders, not shadows.
5. Level is a chip, never a colour.
6. Tabular figures on every time, score and count.
7. If it needs a decision, put the decision on the card.
8. Nothing bounces.

All eight hold in prototypes and in production code alike. In production, apply them
through the shadcn token vocabulary — same colours, different names.
