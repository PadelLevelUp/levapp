---
about: gcloud auth login runs in tmux; the owner gets the link as a phone notification and pastes the code back
permanence: changing
verified: "2026-11-15 (told)"
origin:
  - person:owner@2026-11-15
applies_when: "When a session needs gcloud credentials refreshed (gcloud auth login)"
scope:
  - action
match: { commands: ["gcloud auth login"], paths: [] }
source: user@2026-11-15
---

# gcloud sign-in goes to the owner as a link

Never ask the owner to run `gcloud auth login`. The owner is often away from the computer.

1. Start it yourself in a detached tmux session, with no browser:
   `tmux new-session -d -s gcloud-auth -x 400 -y 50 'gcloud auth login --no-launch-browser'`.
2. Read the link with `tmux capture-pane -t gcloud-auth -p -J`.
3. Ask CASEY (through your parent, up the Relay chain) to send the owner a phone notification with
   the link. Name the session that needs the sign-in.
4. The owner signs in and pastes the verification code back. Type it in with
   `tmux send-keys -t gcloud-auth '<code>' Enter`, check that the sign-in succeeded, then kill the tmux session.

The code is single-use. Never write it to a file or a commit.

Filing: gcloud sign-in runs in tmux and the owner gets the link → cortex/world/rules/gcloud-login-goes-to-the-owner-as-a-link.md (origin: person:owner@2026-11-15)
