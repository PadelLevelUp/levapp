---
path: frontend/apps/web/src/components/ui/carousel.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 228
size_tokens: 1601
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e7940214a31c917a47807391e0e038e37a84623ba47a4d4e2522ed06e8d764fe"
---

## Purpose

Embla-carousel-based slideshow (`Carousel`/`Content`/`Item`/`Previous`/`Next`) exposing scroll state (`canScrollPrev`/`canScrollNext`, `scrollPrev`/`scrollNext`) to descendants through a `useCarousel` context hook, plus left/right arrow-key navigation on the root. Previous/Next controls render through the shared `Button` component and carry `react-i18next`-translated sr-only labels.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/button`: `Button` — renders `CarouselPrevious`/`CarouselNext`.
- `embla-carousel-react`: `useEmblaCarousel`, the underlying carousel engine.
- `lucide-react`: `ArrowLeft`/`ArrowRight` icons.
- `react`: context, forwardRef, hooks.
- `react-i18next`: `useTranslation`, for the previous/next sr-only labels.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
