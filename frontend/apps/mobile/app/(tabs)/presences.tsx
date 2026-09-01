import { PresencesScreen } from "@/features/presences/PresencesScreen";

/**
 * PAD-140 — the coach's attendance overview. Coach-only; the tab is removed
 * for students in `_layout.tsx` (`href: null`), and every endpoint behind it
 * re-checks `require_coach()` server-side, so the tab is UX only.
 */
export default function PresencesTab() {
  return <PresencesScreen />;
}
