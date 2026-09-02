# LevelUp — Design Critique Rubric (versioned, fixed)

**Version:** 1 &nbsp;·&nbsp; **Updated:** 2026-07-10 &nbsp;·&nbsp; **Consumed by:** the `weekly-qa` skill

This rubric is intentionally **fixed** so that week-over-week vision scores are
comparable. The QA agent screenshots each key screen (web via Chrome MCP, iOS via
simulator + computer-use) and scores it against the seven dimensions below. Do not
change scoring anchors casually — if you must, bump the version and note it in the
report so trend comparisons account for the shift.

---

## How to score

- Score **each dimension 1–5** using the anchors in that section. Whole numbers only.
- Score **what you can see** in the screenshot(s) for that screen. If a dimension
  does not apply to a screen (e.g. no loading state was captured), mark it `n/a`
  and exclude it from the average — do not default to 5.
- Be **specific and reproducible**: every score below 4 must be justified by at
  least one concrete finding with the screen name and, where possible, the element.
- Prefer **`preview_inspect` / DOM inspection over eyeballing** for exact colors,
  font sizes, and spacing (screenshots lie about sub-pixel values and contrast).
- Each finding gets a **severity** (see the mapping section). The screen's
  `worst_severity` is the highest-severity finding on it.
- **Only P0 and P1 findings are auto-filed as Linear tickets.** P2/P3 roll up into
  the weekly report only.
- A **5** means "no notable issue found," not "perfect" — reserve findings for real,
  actionable defects, not taste.

**Score → quality shorthand:** 5 clean · 4 minor nit · 3 noticeable but usable ·
2 clearly broken/detracting · 1 unusable or embarrassing.

---

## Dimension 1 — Layout & spacing

**Checks**
- Elements align to a consistent grid; no items visually "off by a few px."
- Gaps/padding are consistent between sibling elements (cards, list rows, form fields).
- Clear visual hierarchy: primary action is obvious; headings > subheadings > body.
- No overlapping elements, no content colliding with edges or each other.
- Balanced whitespace — not cramped, not cavernous.

**Scoring**
- **5** — Consistent rhythm, clear hierarchy, everything aligned.
- **4** — One minor inconsistency (a single odd gap or slightly misaligned item).
- **3** — Several small inconsistencies; hierarchy readable but muddy.
- **2** — Obvious misalignment or inconsistent spacing that distracts.
- **1** — Overlapping/colliding elements or no discernible hierarchy.

## Dimension 2 — Theming

**Checks**
- Dark mode is correct on every surface: no black-on-black, no white flashes, no
  unstyled default-white cards/inputs, no low-contrast "invisible" text.
- Colors come from **design tokens**, not hardcoded hex that drifts from the palette.
- Brand/accent colors used consistently for the same semantics (primary, danger, success).
- Toggling light ↔ dark restyles the whole screen, not just part of it.
- **iOS-SPECIFIC — NativeWind `calc()` border-radius bug:** components that should
  have rounded corners render **square** when their radius token uses `calc()`
  (the value silently drops). Inspect cards, buttons, avatars, inputs, sheets:
  square corners where the web equivalent is rounded is a theming **defect**, not
  a design choice. File it. Fix pattern: use precomputed literal radii on mobile,
  never `calc()` in `tailwind.config` `borderRadius`.

**Scoring**
- **5** — Both themes fully correct; tokenized colors; iOS radii rounded as intended.
- **4** — One minor token drift or a single slightly-off color.
- **3** — A few elements off-token, or minor dark-mode contrast weakness.
- **2** — Visible dark-mode breakage (unstyled surface, low-contrast text) **or**
  the iOS square-corner `calc()` bug on a prominent component.
- **1** — Dark mode largely broken / unreadable, or hardcoded colors everywhere.

## Dimension 3 — Responsive

**Checks (web)**
- Renders correctly at **mobile (375px)**, **tablet (768px)**, **desktop (1280px)**.
- No horizontal body scroll; wide content (tables, calendars, code) scrolls inside
  its own container.
- Nav/menus adapt (hamburger vs. full nav) without clipping.
- Content reflows rather than shrinking text into unreadability.

**Checks (iOS)**
- Respects **safe areas**: no content under the notch, status bar, or home indicator.
- Handles the notch / Dynamic Island region gracefully.
- Portrait renders correctly; if orientation is supported, landscape does too.
- No content cut off by the keyboard when inputs are focused.

**Scoring**
- **5** — Correct at every breakpoint / all safe areas respected.
- **4** — One breakpoint slightly imperfect but usable.
- **3** — Noticeable reflow issue at one size, still usable.
- **2** — Horizontal scroll on web, or content under the notch / clipped on iOS.
- **1** — Layout breaks at a common size (unusable on mobile or under keyboard).

## Dimension 4 — Touch targets & accessibility

**Checks**
- **iOS tap targets ≥ 44×44pt** (Apple HIG); web interactive targets comfortably clickable.
- Adequate **text contrast** (WCAG AA: 4.5:1 body, 3:1 large text) in both themes.
- Visible **focus states** on web (keyboard focus ring), and clear pressed states on iOS.
- Icon-only buttons have accessible labels (`aria-label` on web, accessibility labels on iOS).
- Interactive elements are not so close that mis-taps are likely.

**Scoring**
- **5** — All targets adequately sized, contrast passes AA, focus/labels present.
- **4** — One small target or one borderline-contrast element.
- **3** — A couple of small targets or a missing focus ring.
- **2** — Multiple sub-44pt targets or a real contrast failure on primary text.
- **1** — Core actions untappable/unreachable by keyboard, or widespread contrast failures.

## Dimension 5 — States

**Checks**
- **Loading:** skeletons/spinners appear and **resolve**; no infinite spinners.
- **Empty:** every list/screen has a purposeful empty state (message + CTA), never blank.
- **Error:** failures show a readable message with a recovery path (retry), not a
  raw stack trace, 401 body, or white screen.
- **Long text / overflow:** long names, notes, and labels truncate or wrap cleanly —
  no clipping, no layout blowout, no text spilling out of its container.

**Scoring**
- **5** — All four states handled cleanly where applicable.
- **4** — One state slightly rough (e.g. a plain empty state with no CTA).
- **3** — One state missing or weak (e.g. no skeleton, abrupt content pop-in).
- **2** — A broken state (infinite spinner, blank empty screen, overflow blowout).
- **1** — Errors crash/white-screen, or overflow makes the screen unusable.

## Dimension 6 — Typography

**Checks**
- Consistent type scale (a small, coherent set of sizes/weights, not ad-hoc).
- Line-height and measure are readable; body text isn't cramped.
- **No clipped or truncated-mid-word text**; no text overlapping other text.
- Consistent font family across screens and platforms; numerals/labels align.
- Emphasis (bold/color) used consistently for the same meaning.

**Scoring**
- **5** — Clean, consistent scale; nothing clipped.
- **4** — One minor inconsistency (a heading a touch off-scale).
- **3** — Several small inconsistencies; still readable.
- **2** — Clipped text or clearly inconsistent sizing that distracts.
- **1** — Widespread clipping/overlap or chaotic, unreadable type.

## Dimension 7 — Web ↔ iOS parity

**Checks**
- The **same feature looks and behaves consistently** across web and iOS
  (layout intent, component styling, iconography).
- **Terminology and labels match** across platforms — the same action is called the
  same thing ("Notify" vs "Remind", "Players" vs "Students", pt/en strings aligned).
- No feature that exists on one platform is silently missing/broken on the other
  without a documented reason (e.g. the iOS Select-portal limitation).
- Empty states, error copy, and primary CTAs read consistently.

**Scoring**
- **5** — Feature reads as the same product on both platforms; labels match.
- **4** — One minor wording or styling divergence.
- **3** — A few label/style divergences; still recognizably the same feature.
- **2** — Notable inconsistency (different terminology for the same action, or
  visibly different layout intent).
- **1** — Feature effectively different or broken on one platform (undocumented).

---

## Severity mapping (design findings → P0/P1/P2/P3)

Assign each finding a severity from its user impact. **Only P0 and P1 are
auto-filed as Linear tickets** by the weekly-qa skill; P2/P3 live in the report.

| Severity | Meaning | Design examples | Action |
|----------|---------|-----------------|--------|
| **P0** | Crash / unusable / data-threatening | White-screen on a key route; dark mode makes primary content invisible; a core action is untappable/unreachable; content permanently hidden under the notch. | **Auto-file Linear ticket** (block the week). |
| **P1** | Core flow broken or seriously degraded | Horizontal-scroll breakage on mobile; infinite spinner on a main screen; error state showing a raw stack trace; contrast failure on primary text; the iOS `calc()` square-corner bug on a prominent, brand-defining component. | **Auto-file Linear ticket.** |
| **P2** | Notable defect, flow still works | Inconsistent spacing/alignment; a plain empty state with no CTA; minor dark-mode token drift; a single sub-44pt secondary tap target; cross-platform label mismatch. | Report only. |
| **P3** | Nit / polish | Slightly off type scale; a marginally uneven gap; a subtle color that could be tokenized. | Report only. |

**Tie-breakers**
- If a finding affects a **P0-journey screen** (see `qa/journeys.yaml` priorities),
  bump borderline P2 → P1.
- **Known, documented limitations are not findings** (e.g. iOS Select-portal
  non-drivability). Note them as `known_limitation`, never file.
- **Both-platform** occurrence of the same defect raises severity one level.

---

## Machine-readable summary (one block per screen)

The agent fills this template for **each screen** it critiques and appends it to the
weekly report, so results can be diffed week over week. Keep `screen`, `platform`,
and dimension keys **stable** for clean diffs.

```yaml
- screen: calendar            # stable screen id (matches journey capture names)
  platform: web               # web | ios
  journey: web-calendar-class-lifecycle   # originating journey id (optional)
  captured_at: 2026-07-12T10:15:00Z
  scores:                     # 1-5, or "n/a" if not applicable to this screen
    layout_spacing: 4
    theming: 3
    responsive: 5
    touch_accessibility: 4
    states: 4
    typography: 5
    parity: 4
  average: 4.17               # mean of applicable (non-n/a) scores
  findings:
    - dimension: theming
      severity: P2
      screen_element: "class card in dark mode"
      note: "Card background uses hardcoded #FFFFFF instead of surface token; low contrast in dark mode."
      evidence: "screenshots/2026-07-12/calendar-dark.png"
      filed: false            # true only for P0/P1 auto-filed to Linear
      linear_issue: null      # e.g. PAD-123 when filed
    - dimension: touch_accessibility
      severity: P3
      screen_element: "week nav chevrons"
      note: "Prev/Next chevrons ~36px; slightly under comfortable target on touch web."
      evidence: "screenshots/2026-07-12/calendar.png"
      filed: false
      linear_issue: null
  known_limitations:
    - "N/A"
  worst_severity: P2          # highest severity among findings; null if none
```

**Report-level rollup** (once per weekly run):

```yaml
run:
  version: 1                  # rubric version used (for trend comparability)
  date: 2026-07-12
  screens_scored: 17
  overall_average: 4.05       # mean of per-screen averages
  worst_severity: P1
  auto_filed: [PAD-201, PAD-202]     # P0/P1 tickets created this run
  trend_vs_last_week: "+0.08"        # overall_average delta (blank if first run)
```
