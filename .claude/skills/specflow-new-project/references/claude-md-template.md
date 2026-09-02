# CLAUDE.md Template

Use this template when generating the project's CLAUDE.md. Adapt sections based on the project type — a CLI tool won't have frontend commands, a library won't have a database section.

```markdown
# [Project Name]

[1 paragraph: what the project does and who it's for]

## Specflow

This project uses Specflow — specs are the source of truth, code is an artifact.

- Specs live in `specs/` organized by domain
- Every implementable behavior has a leaf spec with acceptance criteria
- The build order in `build-order.md` defines implementation sequence
- Never write code without a corresponding spec
- Never skip writing tests — acceptance criteria map directly to test cases

## Build Loop

When implementing a spec, follow this exact sequence:

1. **Check dependencies** — Read the spec's `depends_on`. All dependencies must be `implemented` before starting.
2. **Read the spec** — Understand the intent, entities, rules, and acceptance criteria.
3. **Load relevant skills** — Check `.claude/skills/` for applicable domain knowledge.
4. **Write tests first** — Translate acceptance criteria into test cases. Tests should fail initially.
5. **Implement** — Write the minimum code to make tests pass. Follow rules in RULES.md.
6. **Run tests** — All new tests must pass. Run the full regression suite too.
7. **Update status** — Change the spec's status from `draft` to `implemented`.
8. **Update build log** — Record what was implemented and any decisions made.

## Project Structure

```
[Adapt this to the actual project structure]
```

## Commands

[Adapt these to the project's tech stack]

### Development
```bash
[dev server command]
```

### Testing
```bash
[test commands]
```

### Database
```bash
[migration commands, if applicable]
```

## Key Decisions

[List important architectural and stack decisions with brief rationale]

- **[Decision]** — [Why]

## What NOT to Do

- Never implement without a spec — if the spec doesn't exist, create it first
- Never skip tests — every spec's acceptance criteria become test cases
- Never hardcode configuration — use environment variables or config files
- Never modify specs without user approval — specs are the contract
- Never ignore RULES.md — rules exist for good reasons
```

## Adapting the template

**For a CLI tool:** Remove database and frontend sections. Add sections for argument parsing, input/output formats, and exit codes.

**For an API service:** Add sections for API conventions (REST/GraphQL), authentication, rate limiting, and error response formats.

**For a library:** Add sections for public API surface, versioning, backward compatibility, and documentation generation.

**For a data pipeline:** Add sections for data formats, scheduling, error recovery, and monitoring.
