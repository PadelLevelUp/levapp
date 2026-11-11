---
about: Dual report-dialog mount points
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/scopes/web-components-b/concepts/dual-report-mount-points.md@ef7a5f3
---

# Dual report-dialog mount points

`ReportMessageDialog.tsx` is one reusable component mounted from TWO independent places in `messages/`: `ChatThread.tsx` (thread-level, reports the most recent message from the other participant, triggered from `ChatHeader`'s dropdown) and `MessageBubble.tsx` (per-message, triggered from `MessageActionMenu`'s "Report" action). Each mount owns its own `open` state — there is no shared report-dialog singleton. A change to the report flow needs to be checked against both mount points; a bug fix in one does not automatically apply to the other.

Files: `element:frontend/apps/web/src/components/messages/ChatThread.tsx#ChatThread`, `element:frontend/apps/web/src/components/messages/MessageBubble.tsx#MessageBubble`, `element:frontend/apps/web/src/components/messages/ReportMessageDialog.tsx#ReportMessageDialog`.

<!-- 3.x fields of insight/scopes/web-components-b/concepts/dual-report-mount-points.md, carried verbatim by cortex migrate -->
```yaml
slug: dual-report-mount-points
```
