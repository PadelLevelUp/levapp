---
name: run-linear-ticket
description: Fetch a Linear ticket by reference (ID, name, "last created", "most urgent", etc.), extract the Claude Code prompt from its description, and spawn an autonomous agent to implement it using /implement-ticket. Use this skill whenever the user wants to pick up a Linear ticket, says things like "run the latest ticket", "implement PAD-25", "grab the most urgent ticket", "work on the last one created", or references a Linear task they want implemented.
---

# Run Linear Ticket

Fetch a Linear ticket, extract the embedded Claude Code prompt, and kick off autonomous implementation.

## How it works

The project's Discord bot creates Linear tickets with a `## Claude Code Prompt` section in the description containing a pre-formatted prompt. Its opening line depends on the ticket type and determines what the spawned agent does:

- `Implement the following ticket.` — bug/feature/improvement → triggers `/implement-ticket`
- `Investigate the following ticket.` — investigation → the agent reproduces the issue, fixes it if trivial, otherwise posts an investigation report as a Linear comment (instructions are self-contained in the prompt)
- `Decompose the following feature request.` — feature_request → triggers `/decompose-feature-request`, which plans and creates child tickets instead of implementing

This skill bridges Linear and the autonomous workflows — you find the right ticket, pull out that prompt, and hand it off to an agent verbatim; the opener routes it.

## Step 1: Resolve the ticket reference

The user might refer to a ticket in many ways. Match their intent to the right Linear MCP tool:

| User says | Strategy |
|---|---|
| A ticket ID like `PAD-25` or `LVL-42` | Use `mcp__linear-server__get_issue` with that ID directly |
| A title or keyword like "calendar bug" | Use `mcp__linear-server__list_issues` with `query` param, or `mcp__linear-server__research` for fuzzy matches |
| "the last one created" / "latest ticket" | Use `mcp__linear-server__list_issues` with `orderBy: "createdAt"`, `limit: 1` |
| "most urgent" / "highest priority" | Use `mcp__linear-server__list_issues` with `priority: 1` (Urgent), falling back to `priority: 2` (High) if none found |
| "next ticket in backlog" | Use `mcp__linear-server__list_issues` with `state: "Backlog"`, `orderBy: "createdAt"`, `limit: 1` |
| Something vague or complex | Use `mcp__linear-server__research` with a natural-language query |

If the query returns multiple results, show the user a short list (ID, title, priority) and ask which one to run. If there's exactly one match, confirm it with the user before proceeding.

## Step 2: Fetch full ticket details

If you didn't already get the full description in Step 1, call `mcp__linear-server__get_issue` with the ticket's identifier to get the complete description.

## Step 3: Extract the Claude Code prompt

The prompt lives in the ticket description under a `## Claude Code Prompt` heading, inside a markdown code block:

```
## Claude Code Prompt

\```
Implement the following ticket.

## Ticket: PAD-25
**Title:** Fix calendar crash on empty week
...
\```
```

Extract everything inside the code block. This is the prompt you'll pass to the agent.

If the ticket doesn't have a `## Claude Code Prompt` section, tell the user — this ticket wasn't created by the Discord bot and doesn't have an auto-generated prompt. Offer to show them the ticket description so they can decide what to do.

## Step 4: Confirm and launch

Before spawning the agent, show the user:
- Ticket ID and title
- Priority
- A one-line summary of what it does

Then ask: "Ready to start implementation?" (unless the user already indicated they want it run immediately, e.g., "just run it", "go ahead").

## Step 5: Spawn the implementation agent

Launch a subagent with the extracted prompt. The prompt starts with "Implement the following ticket" which triggers the `/implement-ticket` skill automatically via the SessionStart hook and skill matching.

```
Use the Agent tool to spawn the implementation:
- prompt: <the extracted Claude Code prompt>
- mode: "bypassPermissions" (the autonomous workflow needs to run without interruption)
- description: "Implement <TICKET-ID>"
```

The agent will autonomously:
1. Create/switch to the feature branch (via SessionStart hook)
2. Write an E2E test (TDD)
3. Plan the implementation
4. Code it
5. Run tests and iterate
6. Commit, serve via Tailscale, and notify on Discord (via Stop hook)

## Edge cases

- **Ticket already in progress**: If the ticket state is "In Progress" or "Done", warn the user — someone (or a previous run) may already be working on it.
- **No tickets match**: Tell the user clearly. Suggest they check the team/project filters or try a different search term.
- **Multiple matches for ambiguous query**: Show a numbered list and let the user pick.
- **Missing prompt section**: The ticket wasn't created via the Discord bot. Show the description and let the user decide whether to craft a prompt manually or skip it.
