import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  coachInviteAcceptSchema,
  playerInviteAcceptSchema,
  playerFormSchema,
  classFormSchema,
  exerciseFormSchema,
  availabilityBlockerSchema,
} from "./index";

const firstIssue = (result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  result.error!.issues[0];

describe("usernameSchema / passwordSchema", () => {
  it("accepts valid values", () => {
    expect(usernameSchema.safeParse("abc").success).toBe(true);
    expect(passwordSchema.safeParse("secret").success).toBe(true);
  });

  it("rejects a username shorter than 3 characters", () => {
    const result = usernameSchema.safeParse("ab");
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe(
      "Username must have at least 3 characters"
    );
  });

  it("rejects a password shorter than 6 characters", () => {
    const result = passwordSchema.safeParse("12345");
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe(
      "Password must have at least 6 characters"
    );
  });
});

describe("loginSchema", () => {
  it("parses valid credentials", () => {
    expect(
      loginSchema.safeParse({ username: "coach", password: "secret" }).success
    ).toBe(true);
  });

  it("rejects short username and short password", () => {
    expect(
      loginSchema.safeParse({ username: "ab", password: "secret" }).success
    ).toBe(false);
    expect(
      loginSchema.safeParse({ username: "coach", password: "12345" }).success
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    name: "John Doe",
    username: "johndoe",
    email: "john@example.com",
    password: "secret1",
    repeatPassword: "secret1",
  };

  it("parses valid input (phone optional)", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
    expect(
      registerSchema.safeParse({ ...valid, phone: "912345678" }).success
    ).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "J" });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe(
      "Name must have at least 2 characters"
    );
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("Invalid email");
  });

  it("rejects mismatched passwords on repeatPassword", () => {
    const result = registerSchema.safeParse({
      ...valid,
      repeatPassword: "different",
    });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("Passwords do not match");
    expect(firstIssue(result).path).toEqual(["repeatPassword"]);
  });
});

describe("coachInviteAcceptSchema", () => {
  const valid = {
    name: "Coach Ana",
    username: "coachana",
    password: "secret1",
    repeatPassword: "secret1",
  };

  it("parses valid input", () => {
    expect(coachInviteAcceptSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords on repeatPassword", () => {
    const result = coachInviteAcceptSchema.safeParse({
      ...valid,
      repeatPassword: "other",
    });
    expect(result.success).toBe(false);
    expect(firstIssue(result).path).toEqual(["repeatPassword"]);
  });

  it("rejects short name / username / password", () => {
    expect(coachInviteAcceptSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(coachInviteAcceptSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
    expect(
      coachInviteAcceptSchema.safeParse({
        ...valid,
        password: "12345",
        repeatPassword: "12345",
      }).success
    ).toBe(false);
  });
});

describe("playerInviteAcceptSchema", () => {
  const valid = {
    username: "player1",
    password: "secret1",
    repeatPassword: "secret1",
  };

  it("parses valid input (no name field required)", () => {
    expect(playerInviteAcceptSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords on repeatPassword", () => {
    const result = playerInviteAcceptSchema.safeParse({
      ...valid,
      repeatPassword: "other",
    });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("Passwords do not match");
    expect(firstIssue(result).path).toEqual(["repeatPassword"]);
  });
});

describe("playerFormSchema", () => {
  it("parses with only a name (everything else optional)", () => {
    expect(playerFormSchema.safeParse({ name: "John Doe" }).success).toBe(true);
  });

  it("trims the name and rejects whitespace-only names", () => {
    const parsed = playerFormSchema.parse({ name: "  John  " });
    expect(parsed.name).toBe("John");
    const result = playerFormSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("Name is required");
  });

  it("accepts only left/right/both for side", () => {
    expect(
      playerFormSchema.safeParse({ name: "J D", side: "left" }).success
    ).toBe(true);
    expect(
      playerFormSchema.safeParse({ name: "J D", side: "middle" }).success
    ).toBe(false);
  });
});

describe("classFormSchema", () => {
  it("parses a one-off class with only a date", () => {
    expect(
      classFormSchema.safeParse({ date: "2026-07-06", isRecurring: false })
        .success
    ).toBe(true);
  });

  it("rejects an empty date", () => {
    const result = classFormSchema.safeParse({ date: "", isRecurring: false });
    expect(result.success).toBe(false);
    expect(firstIssue(result).path).toEqual(["date"]);
  });

  it("recurring requires at least one weekday", () => {
    const result = classFormSchema.safeParse({
      date: "2026-07-06",
      isRecurring: true,
      daysOfWeek: [],
      endDate: "2026-08-01",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0])).toContain("daysOfWeek");
  });

  it("recurring requires an end date", () => {
    const result = classFormSchema.safeParse({
      date: "2026-07-06",
      isRecurring: true,
      daysOfWeek: [1, 3],
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0])).toContain("endDate");
  });

  it("parses a valid recurring class and rejects out-of-range weekdays", () => {
    expect(
      classFormSchema.safeParse({
        date: "2026-07-06",
        isRecurring: true,
        daysOfWeek: [0, 6],
        endDate: "2026-08-01",
      }).success
    ).toBe(true);
    expect(
      classFormSchema.safeParse({
        date: "2026-07-06",
        isRecurring: true,
        daysOfWeek: [7],
        endDate: "2026-08-01",
      }).success
    ).toBe(false);
  });
});

describe("exerciseFormSchema", () => {
  const valid = {
    name: "Volley drill",
    type: "volley",
    difficulty: 3,
    levelIds: [],
  };

  it("parses valid input", () => {
    expect(exerciseFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty (or whitespace-only) name", () => {
    expect(exerciseFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(exerciseFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects an unknown exercise type", () => {
    expect(
      exerciseFormSchema.safeParse({ ...valid, type: "smash" }).success
    ).toBe(false);
  });

  it("only accepts integer difficulty 1-5", () => {
    expect(exerciseFormSchema.safeParse({ ...valid, difficulty: 1 }).success).toBe(true);
    expect(exerciseFormSchema.safeParse({ ...valid, difficulty: 5 }).success).toBe(true);
    expect(exerciseFormSchema.safeParse({ ...valid, difficulty: 0 }).success).toBe(false);
    expect(exerciseFormSchema.safeParse({ ...valid, difficulty: 6 }).success).toBe(false);
    expect(exerciseFormSchema.safeParse({ ...valid, difficulty: 2.5 }).success).toBe(false);
  });
});

describe("availabilityBlockerSchema", () => {
  const valid = {
    date: "2026-07-06",
    startTime: "09:00",
    endTime: "10:00",
    isRecurring: false,
  };

  it("parses valid input (title/endDate optional and nullable)", () => {
    expect(availabilityBlockerSchema.safeParse(valid).success).toBe(true);
    expect(
      availabilityBlockerSchema.safeParse({
        ...valid,
        title: null,
        endDate: null,
      }).success
    ).toBe(true);
  });

  it("rejects an empty date", () => {
    const result = availabilityBlockerSchema.safeParse({ ...valid, date: "" });
    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("Date required");
  });

  it("requires startTime and endTime to be present", () => {
    const { startTime: _s, ...noStart } = valid;
    const { endTime: _e, ...noEnd } = valid;
    expect(availabilityBlockerSchema.safeParse(noStart).success).toBe(false);
    expect(availabilityBlockerSchema.safeParse(noEnd).success).toBe(false);
  });
});
