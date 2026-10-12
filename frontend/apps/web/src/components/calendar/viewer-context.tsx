/**
 * PAD-578 (calendar.view rule 6, calendar.mobile-views rule 19): who is looking at the
 * calendar. The page knows (a coach manages classes, a student does not) and the cards
 * only read it, so a card never reaches for the session itself. Absent a provider the
 * viewer is a coach — every existing card test keeps its meaning.
 */
import * as React from "react";
import type { CalendarViewer } from "@levelup/config";

const CalendarViewerContext = React.createContext<CalendarViewer>("coach");

export function CalendarViewerProvider({
  viewer,
  children,
}: {
  viewer: CalendarViewer;
  children: React.ReactNode;
}) {
  return <CalendarViewerContext.Provider value={viewer}>{children}</CalendarViewerContext.Provider>;
}

export function useCalendarViewer(): CalendarViewer {
  return React.useContext(CalendarViewerContext);
}
