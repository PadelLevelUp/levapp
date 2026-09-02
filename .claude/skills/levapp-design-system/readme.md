# LevApp Design System

The design language for **LevApp**, a padel/tennis academy app. Coaches run classes, fill
empty seats, track player progress and message players; players see their own classes and
progress.

The product was called **LevelUp** and much of the plumbing still is: the repos
(`levelup_frontend/`, `levelup_backend/`), the npm scope (`@levelup/*`), the Expo
`app.json` name and the web `<title>`. The rename is a brand decision, not a refactor —
write **LevApp** in new user-facing copy, marks, titles and docs, and leave code
identifiers alone until someone asks for that migration. "LevelUp" below always means the
old name or the old green product.

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
production source** — it was authored from the redesign plan. The codebase *does* exist,
at `levelup_frontend/` in this umbrella directory, and it does not look like this. Read
the next section before you write a line of production CSS.

---

## Production reality — read this before touching `levelup_frontend/`

This design system is a **proposal**. As of 2026-08-06 none of it ships: a grep for
`0B1524`, `1355DC`, `2F8AFF` and `0D1B31` across `packages/` and both apps' `src/`
returns nothing. The shipping app is still the **green** shadcn system.

| | This skill (the redesign) | Production today |
|---|---|---|
| Identity colour | Navy `#0B1524` + blue `#1355DC` | Green `152 60% 42%` ("padel court green") |
| Token form | `--lv-blue-600: #1355DC` — literal hex, consumed as `var(--lv-*)` | HSL triplets `--primary: 152 60% 42%`, consumed as `hsl(var(--primary))` via Tailwind |
| Token names | `--action-primary`, `--text-tertiary`, `--border-subtle` | shadcn vocabulary: `primary`, `muted-foreground`, `border`, `card`, `destructive`, plus `academy` / `private` / `success` / `warning` / `info` |
| Source of truth | `tokens/*.css` here | `apps/web/src/index.css` (`@layer base`), mirrored in `packages/config/src/tokens.ts` for mobile via `nativewindTheme()` |
| Components | Plain `.jsx` in `components/` | shadcn/ui + Tailwind classes in `apps/web/src/components/` |

**So:**

- **Prototypes, mocks, slides, throwaway artifacts** → use this system freely. That is
  what it is for.
- **Production code** → write against the shadcn tokens. `bg-primary`, not
  `var(--lv-blue-600)`. A component styled from this skill's palette will look like a
  different app bolted onto the real one.
- **The principles port; the palette does not.** Borders not shadows, tabular numerals,
  one primary action per view, no emoji, numbers with denominators, pt-PT addressed as
  *tu*, nothing bounces — all of that improves production code today, at zero
  rebrand cost. Take those across freely.

**On green.** In the redesign green is demoted to "done" only. In production green is
`--primary` *and* `--success` — it is the brand. Rule 3 below ("green means done") is a
rule of the redesign; do not enforce it on production code, and do not read a green
primary button there as a bug.

**Adopting the redesign is a project, not a styling pass.** The entry point is
`packages/config/src/tokens.ts`; `tokens.test.ts` asserts
`lightThemeHsl.primary === "152 60% 42%"` and names it "the padel court green", so any
change lands with a test change. Web and mobile both read that package, so a partial
swap desyncs the two apps. Do it only on an explicit request, as its own ticket.

---

## Content fundamentals

**Language.** Portuguese (pt-PT), the language of the existing product. Copy from the
current app is kept verbatim: *Painel, Calendário, Jogadores, Treino, Mensagens,
Definições, Aula 5, Nível 4-, Adicionar avaliação*. Never use Brazilian forms.

In **prototypes**, write pt-PT strings inline. In **production**, the app is fully
i18n'd — strings live in `levelup_frontend/src/locales/{pt,en}/*.json` (the **repo root**
tree, not `apps/web/src/`; `apps/web/src/i18n.ts` globs `../../../src/locales/*/*.json`)
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

*Everything in this section describes the **redesign**, and applies as written to
prototypes and artifacts. In production code the structural rules (space, shape,
surfaces, motion, interaction states, imagery, layout) still apply; the **palette** does
not — see Production reality above.*

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

The old brand green survives only as "done". That demotion is the point: because green
means one thing, a green badge is now informative. Never pick a status colour for
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
levelup_frontend/apps/web/src/index.css           the shipping CSS variables (@layer base)
levelup_frontend/apps/web/tailwind.config.ts      how those become Tailwind class names
levelup_frontend/packages/config/src/tokens.ts    same tokens for mobile (nativewindTheme)
levelup_frontend/apps/web/src/components/ui/      shadcn primitives — reuse, don't re-author
levelup_frontend/src/locales/{pt,en}/           all user-facing strings (repo-root, NOT apps/web)
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
library, desktop two-pane layouts, and any slide or marketing surface. In the redesign,
the player app reuses this system with the light theme and blue accents while coaches get
the navy chrome — that split is a proposal, not something production does today.

---

## Rules of thumb for anyone building here

1. One `primary` button per view.
2. A number never appears without a denominator or a direction.
3. Green means done. Amber means you. Nothing else. *(Redesign only — in production
   green is the brand primary.)*
4. Cards in a list have borders, not shadows.
5. Level is a chip, never a colour.
6. Tabular figures on every time, score and count.
7. If it needs a decision, put the decision on the card.
8. Nothing bounces.

All eight hold in prototypes. All but #3 hold in production code as well — apply them
there through the shadcn token vocabulary, not this system's palette.
