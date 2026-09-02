# Web/iOS parity rule — copies of unversioned edits

`levelup/.claude/` is not under git (same as `specs/`), so these edits live only
on the machine that made them. Copied here so they survive and can be replayed.

Versioned copy of the rule: `levelup_frontend/CLAUDE.md` (committed on
`feature/pad-140`) — that one is the source of truth.

Local-only, reproduced here:
- `umbrella-CLAUDE.md` — short form of the rule + pointer to the frontend one
- `skills/plan-implementation` — plans for a web ticket must include the iOS half
- `skills/autonomously-implement-ticket` — new "Step 4b: Port it to iOS" with a checklist
- `skills/react-frontend` — parity section; mobile has no shadcn/Recharts, and
  its i18n namespaces are static imports

Why: `attendance.history` (PAD-114) and the Presences tab (PAD-140) both shipped
web-only, neither with a recorded decision. The implementation skills never
mentioned mobile at all, which is why it kept being missed.
