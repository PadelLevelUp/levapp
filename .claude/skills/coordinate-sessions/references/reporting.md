# Reporting: what you require, and what you send

## What you require from a session

Every report of finished work must carry, without being asked:

1. **What ran, and what did not.** Named. "Not run: the full mobile suite, because the
   machine was held" is a usable report; silence about it is not.
2. **What is claimed on someone else's word.** A heading — *Claimed by X, NOT re-verified
   by me* — with a reason per item. Adoption launders provenance: once a name is on a piece
   of work, the checked and the inherited become indistinguishable to every future reader.
3. **The commit it ran against.** A report that does not say what it ran against is not
   evidence, however much detail it carries.
4. **Expectation separated from observation.** "I expect this to pass and I have not seen
   it pass" is the correct shape. Accept nothing that blurs the two.

## What you require *before* a result exists

For anything that gates a decision, require the reading rule **in advance**: what green
means, what red means, and what the surprising outcome would mean. A limitation written
after a green has been negotiated with the green; written before, it is a prediction someone
has to live with.

Ask for the surprising branch explicitly. The expected outcome is easy; it is the
unexpected one that later attracts a story.

## Stop and tell

A session must stop and tell you, rather than push through, when:

- a result is red for a reason that is not the reason it was testing;
- a fix would ship with a caveat its PR body needs small print to explain;
- the machine is in the state that broke it last time;
- the ticket turns out to be wrong, or smaller, or larger than written.

Three times in one night a session stopped where pushing on would have *looked* like
progress. Each stop cost minutes; each would have cost the night.

Make it explicit that stopping is cheap and that you will back it. A session that believes
stopping will be read as failure will not do it at four in the morning.

## What you send a session

Short. Decision first. Reasoning only where it changes what they do — cite a compass rule
rather than re-deriving it.

Name what they did well **specifically and briefly**, especially when they corrected you or
retracted their own claim. That behaviour is the system's only real safeguard and it is
fragile; a session that is corrected for being wrong and ignored for catching an error
learns the wrong lesson. But keep it to a line — a paragraph of praise is tokens neither of
you needed.

## What you send the owner

**Decision first, then the evidence, then everything else.** In a document written for a
decision, the ordering principle is *what changes the answer*, not *what is most rigorous*.
The most consequential finding is very often the least technical one, and the instinct is to
bury it.

- **Name defects the way the people affected would describe them**, not as a count. "Three
  defects" is a number; "the seat you lose when you say yes again" is a thing a founder
  recognises.
- **Say what is not verified**, and say plainly when a recommendation is something the repo
  cannot enforce.
- **Answer the question they will actually ask.** For anything touching production that
  means: if this goes wrong, what is the way back and how fast?
- **Carry your own corrections upward.** If you passed a number and it was wrong, correct it
  yourself, promptly, before it becomes load-bearing. Correcting inside ten minutes is a
  correction; correcting after it has been acted on is an apology.

## When the owner asks "status?"

One message, in this order, and short — the owner reads it on a phone:

1. **Headline:** the wave you are on out of how many, and one ETA for the whole run.
2. **One table, one row per session:**

   | Session | Doing | % | ETA |
   |---|---|---|---|
   | A | PAD-347 — reminder duplication; PR open, E2E running | 80% | 20 min |

   "Doing" is the ticket and the concrete step, not "working on tickets". An idle session
   says `idle` and why. The percentage is your estimate of that item, not the wave.
3. **Blocked on the owner**, only if something is — one line each, with exactly what you
   need from them. Nothing here means nothing is.
4. **Anything they should know that doesn't fit above** — a defect found, a correction to a
   number you gave earlier. Optional, and at most two lines.

Nothing else: no narrative of what happened, no list of what's done unless they ask. The
ETAs are the owner's way of deciding when to come back, so give real ones and correct them
next time if they slip.

## Keeping the record

Keep one plan file per wave with a timestamped line per event and every decision marked.
Write the reasoning, not just the outcome — the next coordinator inherits an argument, not a
verdict.

`docs/` is gitignored, so anything that must outlive the machine belongs in
`.cortex/compass/` (tracked) or in this skill. **The plan file is the working record; a
compass rule is what travels.**
