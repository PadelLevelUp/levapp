---
id: decision.2026-09-25-evaluation-scale-per-coach
title: "A coach chooses the evaluation scale (1–5, 1–10, 1–20, 1–100); each score keeps the scale it was given on (PAD-423, D147)"
date: 2026-09-25T21:33:41Z
compass_rules:
  - R-047
  - R-048
related_specs:
  - evaluations.scale
  - evaluations.competencies
  - evaluations.legacy-conversion
supersedes: []
sources:
  - ../../../backend/padel_app/models/evaluation_entry.py
  - ../../../backend/padel_app/models/evaluation_category.py
  - ../../../backend/padel_app/services/evaluation_api_service.py
  - ../../../frontend/packages/config/src/evaluation-form.ts
---

# A coach chooses the evaluation scale; each score keeps its own (PAD-423, D147)

**This partly reverses PAD-403.** PAD-403 (owner's Q1 decision, 2026-09-21) moved every
evaluation to 1–5 stars and dropped custom scales (`evaluations.legacy-conversion`). On
2026-09-24 the owner asked for a scale again: in Settings → Evaluations the coach picks 1–5,
1–10, 1–20 or 1–100, and can change it later. The input goes back to a **slider** (owner,
confirmed). The coordinator decided the open points on 2026-09-25 (D147).

## What changes the answer: a score did not know its scale

`EvaluationEntry.score` is a bare number. The scale lived only on the competency
(`EvaluationCategory.scale_min/scale_max`, 1/5 for everything since PAD-403). Changing a
coach's scale by rewriting `scale_max` would silently turn every existing "4 of 5" into "4 of
10". So the scale must travel with the score.

## Decided (D147)

1. **Each score keeps the scale it was given on.** `EvaluationEntry` gains `scale_min` and
   `scale_max`, written on every save and backfilled from the entry's competency by an
   idempotent migration. A score is never rewritten when the coach changes scale; history
   shows "4/5" beside "7/10". Rejected: converting every score on change (PAD-403's way; lossy,
   and repeated changes compound the rounding), and storing percentages (every read path
   changes meaning).
2. **Figures use the coach's current scale, by proportion, on the server (R-048).** A 1–5 score
   of 4 counts as 7.75 on 1–10 (linear from each scale's minimum to its maximum). Means, the
   evolution chart and its change are computed that way server-side; clients draw what the
   server sends.
3. **1–5 keeps the stars; 1–10, 1–20 and 1–100 use a slider** (web: the shadcn `ui/slider`;
   iOS: `@react-native-community/slider`, Expo SDK 54's bundled 5.0.1, autolinked in prebuild,
   no dev-client change, ships in the next iOS build).
4. **One scale per coach**, stored beside "Frequência de avaliações" (`NotificationConfig`),
   set in Settings → Evaluations on web and iOS. It applies to the coach's catalogue and custom
   competencies. **Legacy categories and the five R-047-frozen endpoints are untouched.**
5. **Old clients.** App Store 1.0/1.1.0 only call the frozen endpoints, which serve legacy
   categories, so a coach's new scale never reaches them. Builds 23–25 (1.2.0) draw any
   non-1–5 competency with the dormant `ScoreStepper` using the payload's bounds
   (`origin/main` `ac5b4f844`: `evaluation-form.tsx:109-115`), so they can still rate, with
   taps instead of a slider.

## Why not keep stars at every scale

Stars are readable at five; at ten they are a row nobody counts, and at 100 they are
impossible. The owner confirmed the slider; the stars stay where they work.
