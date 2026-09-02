#!/bin/bash
# Stop hook: serve via Tailscale and send a rich Discord notification
# with the E2E test video, description, and preview URL

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

if [ -z "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# ── Extract ticket info from transcript ──────────────────────────────────────

TICKET_ID=$(grep -oE '[A-Z]+-[0-9]+' "$TRANSCRIPT_PATH" 2>/dev/null | head -1)
if [ -z "$TICKET_ID" ]; then
  exit 0
fi

DISCORD_USER_ID=$(grep -oP 'Discord user ID: \K[0-9]+' "$TRANSCRIPT_PATH" 2>/dev/null | head -1)
DISCORD_USERNAME=$(grep -oP 'Discord username: \K\S+' "$TRANSCRIPT_PATH" 2>/dev/null | head -1)

# ── Source secrets ──────────────────────────────────────────────────────────

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ -f "$PROJECT_DIR/.claude/secrets.env" ]; then
  source "$PROJECT_DIR/.claude/secrets.env"
fi

# ── Ensure dev servers are running ─────────────────────────────────────────

# Start Flask backend if not running on port 5000
if ! curl -s "http://localhost:5000/" > /dev/null 2>&1; then
  cd "$PROJECT_DIR/levelup_backend" 2>/dev/null
  source .venv/bin/activate 2>/dev/null
  nohup flask run --host 127.0.0.1 --port 5000 > /tmp/flask-serve.log 2>&1 &
  cd "$PROJECT_DIR"
  sleep 3
fi

# Start Vite frontend if not running on port 8080
if ! lsof -i :8080 > /dev/null 2>&1; then
  cd "$PROJECT_DIR/levelup_frontend" 2>/dev/null
  nohup npm run dev > /tmp/vite-serve.log 2>&1 &
  cd "$PROJECT_DIR"
  sleep 3
fi

# Serve via Tailscale (point to Vite which proxies API to Flask)
PREVIEW_URL=""
if command -v tailscale &> /dev/null; then
  tailscale serve --bg --set-path / "http://localhost:8080" 2>/dev/null
  TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName' | sed 's/\.$//')
  if [ -n "$TAILSCALE_HOSTNAME" ]; then
    PREVIEW_URL="https://$TAILSCALE_HOSTNAME"
  fi
fi

if [ -z "$PREVIEW_URL" ]; then
  PREVIEW_URL="http://localhost:5000"
fi

# ── Find the E2E test video ──────────────────────────────────────────────────

VIDEO_PATH=""

# Check if the skill saved the video path
if [ -f "$PROJECT_DIR/.claude/last-test-video.txt" ]; then
  VIDEO_PATH=$(cat "$PROJECT_DIR/.claude/last-test-video.txt" 2>/dev/null)
fi

# Fallback: find the most recent .webm video in test-results
if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
  VIDEO_PATH=$(find "$PROJECT_DIR" -path "*/test-results/*" -name "*.webm" -newer "$PROJECT_DIR/.claude/hooks/session-start-branch.sh" 2>/dev/null | sort -t/ -k1 | tail -1)
fi

# ── Get the branch and changed files for context ────────────────────────────

BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "unknown")

CHANGED_FILES=$(git -C "$PROJECT_DIR" diff --name-only main..."$BRANCH" 2>/dev/null | head -20)

# Categorize changes
BACKEND_CHANGES=$(echo "$CHANGED_FILES" | grep -c "^levelup_backend/" 2>/dev/null || echo "0")
FRONTEND_CHANGES=$(echo "$CHANGED_FILES" | grep -c "^levelup_frontend/src/" 2>/dev/null || echo "0")
TEST_CHANGES=$(echo "$CHANGED_FILES" | grep -cE "^(levelup_frontend/e2e/|e2e/)" 2>/dev/null || echo "0")
TOTAL_CHANGES=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

# ── Build the Discord message ────────────────────────────────────────────────

DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
if [ -z "$DISCORD_WEBHOOK_URL" ]; then
  echo "No DISCORD_WEBHOOK_URL set, skipping notification"
  exit 0
fi

if [ -n "$DISCORD_USER_ID" ]; then
  MENTION="<@$DISCORD_USER_ID>"
else
  MENTION="@${DISCORD_USERNAME:-someone}"
fi

# Build a summary of what was done
SUMMARY="$MENTION — **$TICKET_ID** is ready for review!\n\n"
SUMMARY+="**Branch:** \`$BRANCH\`\n"
SUMMARY+="**Preview:** $PREVIEW_URL\n\n"
SUMMARY+="**Changes:** $TOTAL_CHANGES files ($BACKEND_CHANGES backend, $FRONTEND_CHANGES frontend, $TEST_CHANGES tests)\n\n"

# Add changed files list (truncated)
if [ -n "$CHANGED_FILES" ]; then
  SUMMARY+="**Files changed:**\n\`\`\`\n$(echo "$CHANGED_FILES" | head -10)\n"
  if [ "$TOTAL_CHANGES" -gt 10 ]; then
    SUMMARY+="...and $((TOTAL_CHANGES - 10)) more\n"
  fi
  SUMMARY+="\`\`\`\n\n"
fi

SUMMARY+="Test the changes at the preview URL and leave your feedback here. React with ✅ when approved."

# ── Send to Discord ──────────────────────────────────────────────────────────

if [ -n "$VIDEO_PATH" ] && [ -f "$VIDEO_PATH" ]; then
  # Send with video attachment using multipart form
  curl -s \
    -F "content=$SUMMARY" \
    -F "files[0]=@$VIDEO_PATH;filename=${TICKET_ID}-test-recording.webm" \
    "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1
  echo "Notified Discord with video attachment"
else
  # Send text-only
  curl -s -H "Content-Type: application/json" \
    -d "{\"content\": \"$SUMMARY\"}" \
    "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1
  echo "Notified Discord (no video found)"
fi

# ── Cleanup ──────────────────────────────────────────────────────────────────

rm -f "$PROJECT_DIR/.claude/last-test-video.txt"
