---
id: P-EVALUATIONS-1
title: "Coach evaluates a player"
status: draft
---
# Coach evaluates a player

## Outcome

A coach keeps a picture of how each player is developing: they choose what they score, record scores over time and look back at them, including scores brought in by import. Players see no evaluation unless a coach shares one.

- What a coach scores is organised in categories, which may hold sub-categories (PAD-431). A new coach starts with Consistência; Tática (posição defensiva, posição atacante, transição, tomada de decisão, jogo em dupla); and Técnica (direita, esquerda, volley, bandeja, víbora, smash, saída de vidro, duplo vidro, serviço). A coach who already had categories keeps them, and is offered the defaults they lack.
- Categories belong to their coach, with unique names. A coach can add, rename, switch off and delete any category or sub-category; renaming keeps every score. Deleting removes its scores, and a category's sub-categories, after the coach has seen how many and typed the name.
- Where a category has sub-categories, they are scored; one without (Consistência) is scored directly. A score a category already held is kept as history, never mixed into its sub-categories.
- A record holds only scores a coach gave: an unscored category shows as not rated, never a number (PAD-337). One known gap stays: an App Store version from before that fix still stores the middle of the scale for an old category the coach left untouched. The player's page shows the latest score per category.
- The coach chooses the scale: 1–5 stars, 1–10, 1–20 or 1–100, and can change it. Past evaluations keep their scale; progress shows on the current scale (PAD-423). The server refuses a score outside its scale and keeps nothing from that save.
- Existing 1–10 scores were converted to five stars by halving and rounding up, keeping the originals so it can be undone; nothing deleted or re-dated (owner, 2026-09-22). An old app still sending 1–10 is converted, not refused. A card shared before the conversion keeps its numbers.
- An evaluation is the player, the class occurrence (or none) and the day. A rating can be taken back; an evaluation is corrected on its day and only deleted afterwards.
- The private note is the coach's and reaches a player only in a share.
- Averages, trends and "due" are worked out in one place, so web and phone agree.
- The evaluation settings sit together under "Avaliações": categories, how often to evaluate, the scale.
- Coaches on an App Store version from before the redesign keep working: they see and score only their old categories, and cannot put a score into one they were never shown.
- Strengths and weaknesses keep working, and leave the web form only once another web place to edit them exists.
- Bulk-imported evaluations are grouped by player and date like ones entered by hand. They are scored on 1–5: a score outside it is reported and left out, and the rest of the sheet still imports.

It does not promise the general import flow, showing anything to a player, dark mode on iOS, or re-rating scores the conversion merged.
