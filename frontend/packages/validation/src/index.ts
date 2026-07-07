import { z } from "zod";

/* ── Auth (AuthPage) ─────────────────────────────────────────────────────── */

export const usernameSchema = z
  .string()
  .min(3, "Username must have at least 3 characters");

export const passwordSchema = z
  .string()
  .min(6, "Password must have at least 6 characters");

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

/* ── Registration (RegisterPage) ─────────────────────────────────────────── */

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must have at least 2 characters"),
    username: z.string().min(3, "Username must have at least 3 characters"),
    email: z.string().email("Invalid email"),
    phone: z.string().optional(),
    password: z.string().min(6, "Password must have at least 6 characters"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/* ── Invitations (CoachInvitePage / PlayerInvitePage) ────────────────────── */

export const coachInviteAcceptSchema = z
  .object({
    name: z.string().min(2, "Name must have at least 2 characters"),
    username: z.string().min(3, "Username must have at least 3 characters"),
    password: z.string().min(6, "Password must have at least 6 characters"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export type CoachInviteAcceptInput = z.infer<typeof coachInviteAcceptSchema>;

export const playerInviteAcceptSchema = z
  .object({
    username: z.string().min(3, "Username must have at least 3 characters"),
    password: z.string().min(6, "Password must have at least 6 characters"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export type PlayerInviteAcceptInput = z.infer<typeof playerInviteAcceptSchema>;

/* ── Player create/edit (AddPlayerSheet / EditPlayerSheet) ───────────────── */
// Web only hard-requires a non-empty name; username/email uniqueness is
// validated server-side via /app/check_field_available.

export const playerFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  levelId: z.string().optional(),
  side: z.enum(["left", "right", "both"]).optional(),
  notes: z.string().optional(),
});

export type PlayerFormInput = z.infer<typeof playerFormSchema>;

/* ── Class create (AddClassSheet) ────────────────────────────────────────── */
// Mirrors the web sheet's handleSave checks: date always required; recurring
// classes additionally require at least one weekday and an end date.

export const classFormSchema = z
  .object({
    date: z.string().min(1, "Date"),
    isRecurring: z.boolean(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    endDate: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["daysOfWeek"],
        message: "Days of the week",
      });
    }
    if (data.isRecurring && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date",
      });
    }
  });

export type ClassFormInput = z.infer<typeof classFormSchema>;

/* ── Exercise create/edit (ExerciseFormSheet) ────────────────────────────── */
// Web enables submit only when the name is non-empty after trimming.

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().optional(),
  type: z.enum([
    "attack",
    "defense",
    "serve",
    "return",
    "volley",
    "transition",
    "warm_up",
    "footwork",
    "custom",
  ]),
  customType: z.string().optional(),
  difficulty: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  levelIds: z.array(z.string()),
  notes: z.string().optional(),
});

export type ExerciseFormInput = z.infer<typeof exerciseFormSchema>;

/* ── Availability blocker (AvailabilityPage) ─────────────────────────────── */
// Web only hard-requires a date ("Date required" toast).

export const availabilityBlockerSchema = z.object({
  title: z.string().nullable().optional(),
  date: z.string().min(1, "Date required"),
  startTime: z.string(),
  endTime: z.string(),
  isRecurring: z.boolean(),
  endDate: z.string().nullable().optional(),
});

export type AvailabilityBlockerInput = z.infer<typeof availabilityBlockerSchema>;
