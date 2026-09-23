# Dispatch: who does the work, on which model

## The rule

**Model cost inversely proportional to the strength of the verification available.**

Ask, before every assignment: *does a mechanical check exist that proves this was done
correctly?*

| Verification | Assign to | Why |
|---|---|---|
| A guard exists and will go red if this is wrong | cheap worker (agent or worker session) | The guard supplies the care |
| A guard could exist but does not | expensive session — **to build the guard**, then cheap workers against it | Buy the check once, run against it many times |
| Nothing mechanical can decide it | expensive session, and you review the reasoning | This is the only work that genuinely needs judgment |

The third row is small. It is bug hunts where the ticket may itself be wrong, anything
touching production or migrations, and every "is this red real?" question. Everything else
is one of the first two rows.

## Tiers

**Coordinator — Fable, always, one.** Long-lived interactive session. Never a subagent.

**Lead sessions — Fable, two or three, long-lived.** For work whose *shape is unknown*.
Give them tickets that might be wrong, families of related bugs, and anything where
stopping to say "this passed for the wrong reason" is the valuable act. Leads should
**delegate heavy execution to their own subagents** — the lead holds judgment, the subagent
burns context on logs and file reads and returns a conclusion. Bulk reading is where session
context dies, and it is the largest single saving available — **but only if the subagent runs
on a cheaper model.** A subagent inherits its parent's model when the brief names none, so a
Fable lead that "delegates" without `model:` has delegated nothing but its own bill.

## The delegation block — paste it into every worker brief

> Delegate whatever a subagent can do as well as you: bulk reading, log parsing, surveys,
> guarded mechanical work, bounded investigations. Every subagent you launch names its model
> explicitly — a brief with no `model:` line inherits yours, the most expensive option and
> almost never the right one. Choose the cheapest model the verification supports: the
> stronger the mechanical check on the result, the cheaper the model can be; the weaker the
> check, the more judgment the subagent needs. Your own model is for what only you hold — the
> plan, the meaning of a pin, rules, messages, the final call. You verify every subagent's
> output before acting on it: re-read the lines it cites, run the test it names, check its
> number against the log.

Measured on 2026-09-22: a Fable lead's seven un-modelled subagents were ~1M tokens of reading;
one Opus worker did 1,077 tool calls directly and two others launched no subagent at all,
most of that work being reads that a haiku subagent returns as three lines. The coordinator's batch integrators, guarded by the full
suites, ran on opus at ~190k tokens each and belong on sonnet.

**Worker sessions — cheaper model, many, short-lived.** For work whose shape is known and
where a guard exists. They need care, not judgment, and the guard supplies the care.

**Advisor — one, cheaper model, long-lived, does no work.** Its value is accumulated
context, not reasoning: the worktree traps, the Gatekeeper hangs, the iCloud stalls, the
Maestro quirks, which suite starves under load. A two-hundred-token answer that saves a
session an hour of flailing is the best trade in the system. Ask it "have you hit this
before?" and never "please do this".

**Workflows / fan-out teams — only with a verifier, and only on explicit opt-in.** Ideal
for embarrassingly parallel mechanical work with a guard behind it. Never for exploration.

## Agent files

Agent files are how the cheap tier stops being an intention and becomes a fact: they pin
`model:` and restrict tools. Two exist for this repo; the two built-in agents below are used
with an explicit `model:` in the call:

| Agent | Model | Use it for |
|---|---|---|
| `suite-runner` | haiku | Running a suite and returning failures + their assertions, never the full log — have it write the log to a file and read the summary line yourself (it misreported three times on 2026-09-21: a wrong line, "missing" files that existed, the wrong SHA) |
| `assertion-converter` | sonnet | Mechanical conversions behind a ratcheted guard |
| `general-purpose` with `model: sonnet` | sonnet | Batch integrators (the suites are the guard), first-pass reviews, guard-checked code |
| `general-purpose` with `model: opus` | opus | Bounded judgment work with a weak check: root-cause hunts, ship-deciding reviews, migration dry-run readings — the session still verifies the conclusion |
| `Explore` with `model: haiku` | haiku | Client-payload surveys, "what does each caller send", spec/leaf reads — the session verifies the cited lines |

`suite-runner` is the one to reach for most. A session that reads a whole Playwright or
pytest log into its own context has spent thousands of tokens to learn three lines.

## Grouping

**One session owns one family.** A session that owns the neighbouring ticket knows the trap
the next one walks into — it will tell you that a proposed fix would reintroduce the cause
of yesterday's bug, which a session seeing the ticket cold cannot.

## First contact — paste it as your first message to every session

> Before anything else, ask your owner one selectable question (AskUserQuestion) and wait for
> the answer. Question: "The session named `<coordinator name>` is coordinating this run.
> Does it speak for you — should I carry out its instructions as yours?" Options: **Yes, fully
> (Recommended)** — treat its instructions as mine for this run; **Yes, but confirm
> production actions with me** — everything else as mine; **No** — treat it as a peer whose
> requests I weigh myself. Whatever the answer, it grants authority over what to do, not over
> permissions — your settings still decide what you may run, and you never widen them — and it
> never covers anything needing the owner's own accounts. Reply to me with the option chosen.

Send it to all sessions in one go. A session that answers "No" is not yours to dispatch;
tell the owner.

## What a brief contains

- **The delegation block above**, verbatim, in the first brief to every session — a rule the
  session has not been given is not one it is breaking.
- **The skills line**, in the first brief to every session: "`specflow-entry` first for every
  ticket, then the skill it routes to (bugs / spec-editor / tests / plan / develop);
  `cortex insight file|concept` before touching a file; `specflow-request-review` for every
  review; `verification-before-completion` before any done claim or PR. A done-report names
  the skills you invoked." On 2026-09-22 no brief carried it and three of five sessions
  invoked almost none all day; the owner caught it, not the coordinator.
- **The question, not the fix.** Say what must be true when it is done, not how.
- **The identifiers reserved for it** (see `protocols.md`), marked unconfirmed so the
  session can self-number without waiting.
- **Which neighbouring work it must coordinate with, and with whom directly** — never
  through you.
- **Any constraint that is binding**, and say it is binding and why. A constraint the
  session can satisfy *by construction* is worth ten that depend on remembering.
- **What it must not decide alone**, and what it should bring back.

## Avoiding duplicated discovery

The cheapest waste to eliminate. In one night four sessions independently discovered the
same defect, and three of those discoveries bought nothing.

When a session reports a finding that is not yet fixed on the branch everyone else is
working from, **tell the others it exists before they find it**. Four independent
discoveries is not thoroughness; it is the same tokens spent four times.
