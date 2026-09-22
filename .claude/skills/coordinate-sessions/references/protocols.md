# Protocols: collisions, contention, releases

Everything here was learned the expensive way. Each one cost a wave real time.

## Reserve identifiers before dispatch

Parallel sessions all reach for "the next number". Before dispatching a batch, hand each
session a **range**: compass ledger B-IDs, Maestro flow numbers, spec rule numbers. Sessions
self-number inside their range and mark the identifier **unconfirmed**; you veto rather than
approve, so nobody waits on you.

A collision that does land is invisible until someone trips over it — in one instance the
same rule number was issued twice and discovered four separate times from four directions,
because neither rule appeared in the index. **If two things must have distinct numbers,
there should be a test that says so.**

## Append-only lists are keep-both

Some shared files are lists that only grow — the rules index, Maestro `flowsOrder`, the
config barrel, ledger indexes. A merge conflict in one of those resolves **keep both**,
never prefer-one, or somebody's entry silently stops existing. Say so in the commit message.
The rules index conflicted three times in a single night; this is not hypothetical.

For a *numbered item restated on both sides*, the opposite applies: establish which side is
stale and take the current one, and prefer HEAD only when you cannot tell. Do not apply the
list rule to a restated item or the other way round.

## Machine contention

Six sessions share one machine. The failure is not CPU, it is **memory**: load can read
fine while free memory is about to fall off a cliff. Watch memory, not load.

- **One full backend suite at a time.** It is a shared resource; sessions ask, you grant.
- **Never kill by process name.** `pkill -f playwright` takes out a peer's suite. Kill your
  own PIDs or by port only. **Nothing unattended kills what it did not start.**
- **Identify processes by working directory, not by name.** PIDs are reused and names lie.
- **A starved run is worse than a slow one**, because you cannot trust it and will repeat
  it. Serial in the foreground beats four parallel jobs thrashing.
- If a session offers you the choice between a starved parallel run and an honest serial
  one, **take the serial one and absorb the delay yourself.** Sessions blocked on a commit
  are blocked on a commit; a release gated on an untrustworthy run is at risk.

## Release assembly

1. **Assemble in one branch**, in a stated order, and merge each PR in turn. Combination
   failures exist that neither author can see individually: a guard arriving in the same
   release as the rule it demands will pass on both branches and fail on the merge. That is
   what assembling in one branch is *for*.
2. **Push the assembly branch immediately.** An assembled release living only in one
   session's working copy is an hour of careful work one dead laptop away from gone.
3. **Freeze the set during verification.** Once a verification run is in flight against a
   tree, adding a head invalidates it. A verified release of eight beats an unverified nine.
4. **Require a measurement, not an inference**, for anything that decides whether it ships.
   If a session tells you honestly that it has a strong inference and not a measurement,
   take the measurement — especially when the inference is probably right, because a
   shortcut that happens to be correct teaches everyone that shortcuts work.
5. **Fix how the result will be read before it exists.** "Green means X, red means Y",
   written down in advance, so the outcome cannot be reinterpreted to suit the hour.
6. **A session gating a release may stop it, with your backing, at any hour.**

## Conflict routing

Conflicts go to **whoever understands both sides**, not to the coordinator and not
automatically to the original author. If one session owns both hunks, it resolves and tells
nobody. If a session has already established which side is stale, let it resolve and
*inform* the author afterwards rather than asking permission — the rule exists so that
nobody resolves a conflict they do not understand, and that condition is already met.

Warn about the quiet risk in a keep-both resolution: **check the behaviour afterwards, not
that it compiles.** A merged gate condition from one side can silently swallow the other's
case.

## Interrupting

Owner decisions arrive as **plain text**, never as a modal question. A modal question blocks
the session that asks it; one such question stalled an entire wave for forty-five minutes
while three sessions waited on confirmations they could have self-assigned.

Interrupt the owner only for: production promotion, spend, anything needing their terminal
or their account, and a genuinely new user-facing behaviour. Everything else you decide and
document — **it is better to decide and correct than not to get it done.**
