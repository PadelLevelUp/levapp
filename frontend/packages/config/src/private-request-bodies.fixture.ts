/**
 * classes.class-requests criterion 59 (rule 21): the two bodies the private class's single form posts to
 * `createClassRequest`, recorded on the OLD single-form step (web and iOS, the same literals) before the three
 * steps exist. The steps' tests answer the same through three screens and compare to these.
 * The answers: coach `ana-id`, a free hour 18:00-19:00, the note below; the single request names one invitee (`carla`);
 * the weekly one is Tuesdays from 2026-10-06 ending after 3 classes (so on 2026-10-20), no invitee, no note.
 */
export const PRIVATE_REQUEST_COACH = "ana-id";
export const PRIVATE_REQUEST_FREE_WINDOW = { startTime: "18:00", endTime: "19:00" } as const;
export const PRIVATE_REQUEST_NOTE = "Vou levar a minha raquete";

export const SINGLE_WITH_INVITEE_BODY = {
  coachId: "ana-id",
  date: "2026-10-06",
  startTime: "18:00",
  endTime: "19:00",
  note: "Vou levar a minha raquete",
  participants: ["carla"],
} as const;

export const WEEKLY_AFTER_3_CLASSES_BODY = {
  coachId: "ana-id",
  date: "2026-10-06",
  startTime: "18:00",
  endTime: "19:00",
  note: null,
  recurrence: { weekdays: [2], startDate: "2026-10-06", endDate: "2026-10-20" },
} as const;
