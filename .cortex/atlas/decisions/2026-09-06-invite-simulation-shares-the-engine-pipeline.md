---
id: decision.2026-09-06-invite-simulation-shares-the-engine-pipeline
title: The invite simulation shares the engine's candidate pipeline
date: 2026-09-06T00:00:00Z
compass_rules: []
related_specs:
  - notifications.invite-simulation
  - settings.tutorials
  - notifications.coach-understands-who-gets-invited
---

# The invite simulation shares the engine's candidate pipeline

On 2026-09-06 the owner asked for a Settings → Tutorials → "Understand invites" screen: pick a
class, pick a player as the one who cancels, see who the engine would invite and why. Three ways
to produce that answer were put up:

- **A — explaining wrapper.** A new `simulate_vacancy` builds an unsaved Vacancy and calls the
  existing queue and restriction functions unchanged; the "why not" lookup re-runs each filter on
  one player to find where they drop. Cheapest, but the wrapper has to re-state the pipeline's
  filter order, so a later change to the engine can silently make the tutorial lie.
- **B — stage-tagged pipeline.** Refactor `get_eligible_students` and
  `_get_eligible_students_for_group` into one pipeline that tags every roster player with the
  first stage that dropped them; the engine keeps the survivors, the tutorial keeps everything.
  Touches the most central function in the backend, so more test surface, but every future "why"
  surface gets the explanation free and cannot drift.
- **C — explain on the client.** Backend returns the queue; web and iOS derive reasons from config
  and player data. Two evaluators, twice.

**Chosen: B.** The owner first picked A, then reversed to B in the same session. The reason is the
one PAD-133 already established for the eligibility bar: the verdict and its explanation must run
the same evaluator, with the bool defined as "no failures", or the two drift and the coach is
told one thing and shown another. A tutorial whose whole purpose is trust cannot be built on a
copy of the thing it explains. `compute_full_invite_queue` (the semi-auto approval prompt) is
folded onto the same pipeline for the same reason, so the prompt, the engine and the tutorial are
one list.

Two smaller choices made alongside:

- The simulation answers **as of right now** (quiet hours, invitation window, per-day quota
  evaluated against the current clock, reported as gates) rather than a clock-independent
  structural view. The owner chose fidelity over stability; the screen shows when it was
  evaluated.
- The tutorial lists **only the invited queue**, plus a single-student "why isn't … invited?"
  lookup. Listing every excluded student was rejected because rosters run to hundreds.
