import type { ReactNode } from "react";

// admin.phone-console rule 3: a read-only table scrolls sideways inside its own wrapper on a
// phone, so the page itself never does (rule 1). `testId` stays on the <table>; the wrapper
// answers `${testId}-scroll`. From `md` up the table is as wide as it always was.
export function ScrollTable({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div data-testid={`${testId}-scroll`} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table data-testid={testId} className="w-full min-w-[40rem] text-sm md:min-w-0">
        {children}
      </table>
    </div>
  );
}
