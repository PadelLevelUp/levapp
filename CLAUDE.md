<!-- cortex:start v3.3 -->
## Cortex

Cortex is active on **levapp**. The knowledge layer lives in `.cortex/`:

- `compass/` — rules, conventions, and the bug ledger. The "why" and the "must".
- `atlas/` — stakeholders, decisions (narrative), domain terms, source materials.
- `archive/` — ingested source documents (client specs, transcripts, contracts) and their structured extractions.
- `insight/` — inferred understanding of the codebase itself. See "Cortex Insight" below.

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. For "why" questions, grep `compass/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: `.specflow/specs-business/` (outcomes) and
`.specflow/specs/` (implementation), linked by `implements:`/`implemented_by:`. Don't
let the trees drift.

Modules present: compass, atlas, archive, insight, pulse. Schema: 3.3.

## Cortex Insight

This project has a Cortex insight layer at .cortex/insight/ that
contains rich per-file understanding, concept extraction, and
semantic connections across the codebase. It is queryable via
the `cortex insight` CLI.

Read the file itself when you're going to modify it, need exact
syntax, or the change requires knowing every line. Query insight
instead when you're trying to understand what a file does, whether
it's relevant, how it relates, or what its main pieces are — a
richer resume than reading 500 lines and remembering fragments.
Consult insight first; read the file when you need exactness.

Before substantive work on any file, query its insight entry.
Before changes touching multiple files or a concept, query the
concept. This is not optional.

- cortex insight file <path>      — rich per-file understanding
- cortex insight concept <name>   — how a concept lives in the code
- cortex insight element <query>  — atomic element (may return
  "no rich entry"; still discoverable via the file entry)

Also check `insight/observations/` for session-learned context
(audience, scale, intent) the code alone can't show.

Insight is inferred, not curated. Where it conflicts with a compass
rule or a spec, the gated layer wins — context, not authority.
<!-- cortex:end -->
