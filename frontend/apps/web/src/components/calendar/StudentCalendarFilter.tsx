import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseStudentFilter,
  STUDENT_FILTER_DEFAULT,
  studentFilterStorageKey,
  type StudentCalendarFilter as Filter,
} from "@levelup/config";
import { cn } from "@/lib/utils";

/**
 * PAD-664 (calendar.view rule 23): what the student chose to see, remembered per student on this
 * device. Storage can be missing or throw (private window, blocked site data) — the filter then
 * simply works for the session.
 */
function readFilter(userId: string | number | null | undefined): Filter {
  if (userId == null) return STUDENT_FILTER_DEFAULT;
  try {
    return parseStudentFilter(window.localStorage.getItem(studentFilterStorageKey(userId)));
  } catch {
    return STUDENT_FILTER_DEFAULT;
  }
}

export function useStudentCalendarFilter(
  userId: string | number | null | undefined
): [Filter, (next: Filter) => void] {
  const [filter, setFilter] = useState<Filter>(() => readFilter(userId));
  // Another account on the same page (sign-out, sign-in) reads its own choice, as iOS does.
  useEffect(() => {
    setFilter(readFilter(userId));
  }, [userId]);
  const update = useCallback(
    (next: Filter) => {
      setFilter(next);
      if (userId == null) return;
      try {
        window.localStorage.setItem(studentFilterStorageKey(userId), next);
      } catch {
        /* storage unavailable: the choice lasts for this session only */
      }
    },
    [userId]
  );
  return [filter, update];
}

const OPTIONS: { value: Filter; testId: string; key: string }[] = [
  { value: "eligible", testId: "calendar-student-filter-eligible", key: "calendar.studentFilter.eligible" },
  { value: "mine", testId: "calendar-student-filter-mine", key: "calendar.studentFilter.mine" },
];

/** The student's two-option selector, at the top of the calendar. */
export function StudentCalendarFilter({
  value,
  onChange,
  className,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("calendar.studentFilter.label")}
      data-testid="calendar-student-filter"
      className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            data-testid={o.testId}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t(o.key)}
          </button>
        );
      })}
    </div>
  );
}
