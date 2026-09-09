# Logo

The mark is an interlocking **L + A** monogram built from straight strokes on a
navy field, with the A carrying the blue gradient and the L reversed out in white.
It was drawn as vector geometry (not traced from a raster) so it holds at 40px.

| File | Use |
|---|---|
| `levapp-icon.svg` | The full app icon: mark on the navy field. Host applies the iOS squircle mask (`--radius-app-icon`). Never add your own rounded corners on iOS. |
| `levapp-mark-on-dark.svg` | Transparent mark for placing on navy or any dark surface. |
| `levapp-mark-on-light.svg` | Transparent mark for white and light-grey surfaces. |
| `levapp-mark-mono.svg` | Single-colour, inherits `currentColor`. For favicons, print, and anywhere the gradient cannot reproduce. |
| `levapp-wordmark-on-light.svg` / `-on-dark.svg` | The wordmark alone, no mark. |
| `levapp-lockup-on-light.svg` / `-on-dark.svg` | Mark + wordmark, horizontal, clear space already built in. |

## The wordmark and lockup SVGs are outlined

The type is **converted to vector paths** — real Poppins Bold letterforms at
`letter-spacing: -0.02em`, drawn from the font's own outlines. There is no live text, no
`@font-face`, and no font dependency of any kind.

They render identically wherever SVG renders at all: as `<img src>`, inlined in HTML, in
Figma, in Illustrator, in print, offline. Nothing to install.

The consequence of outlining: **the text is no longer editable.** To change the wording,
set it fresh in Poppins&nbsp;700 at `-0.02em` and outline again — don't try to edit the
paths.

## Email needs a raster — this directory ships SVG only

**Every file here is SVG** (verified 2026-09-09: `assets/logo/` contains eight `.svg` and
nothing else). That is a problem for exactly one destination: **Gmail strips `<svg>`
entirely**, and several other clients (Outlook desktop's Word renderer among them) do not
render it either. An email using any mark from this directory shows nothing at all — not a
broken-image icon, nothing.

So anything targeting email needs a **rasterised PNG**, served over HTTPS from a stable
URL, referenced as `<img src>` with explicit `width`/`height` and real `alt` text. The web
app's `frontend/apps/web/public/brand/` directory already serves the SVG marks at
`/brand/*.svg` and is the right home for the PNG beside them.

The lockup is `546 × 140` (3.9:1), so a 2x asset for a 148px-wide header is 296px:

```
rsvg-convert -w 296 levapp-lockup-on-light.svg -o levapp-lockup-on-light.png
```

Light-background lockup, because email clients invert unpredictably and a dark-surface mark
on a client-forced white background disappears. *Not verified: at `origin/staging` `faab7eb`
(2026-09-09) no `.png` exists in `frontend/apps/web/public/brand/` — if you need one,
confirm whether it has landed since before generating a duplicate.*

## Rules
- Clear space on all sides equals the height of the A's crossbar (~1/6 of the mark's height).
- Minimum size: 24px on screen, 8mm in print.
- The wordmark **LevApp** sets in Poppins 700, `letter-spacing: -0.02em`, "Lev" in `--text-primary` (or white) and "App" in `--lv-blue-600` (or `--lv-blue-500` on dark).
- Do not recolour the mark, place it on a photograph without a scrim, rotate it, or stretch it.
- The wordmark is **never** part of the app icon — at 60px it is unreadable.
