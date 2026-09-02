#!/bin/bash
# SessionStart hook: auto-create a branch when a ticket prompt is detected
# Reads the prompt from stdin, extracts ticket identifier, creates branch

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# Only trigger if the prompt contains a ticket identifier pattern (e.g. LVL-123)
TICKET_ID=$(echo "$PROMPT" | grep -oE '[A-Z]+-[0-9]+' | head -1)

if [ -z "$TICKET_ID" ]; then
  # No ticket found in prompt, skip branch creation
  exit 0
fi

# Normalize branch name: LVL-123 → feature/lvl-123
BRANCH_NAME="feature/$(echo "$TICKET_ID" | tr '[:upper:]' '[:lower:]')"

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  exit 0
fi

# Check if branch already exists
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  git checkout "$BRANCH_NAME" 2>/dev/null
  echo "Switched to existing branch $BRANCH_NAME"
  exit 0
fi

# Create branch from latest main
git fetch origin main 2>/dev/null
git checkout main 2>/dev/null
git pull origin main 2>/dev/null
git checkout -b "$BRANCH_NAME" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Created and switched to branch $BRANCH_NAME for ticket $TICKET_ID"
else
  echo "Warning: Could not create branch $BRANCH_NAME" >&2
  exit 0
fi
