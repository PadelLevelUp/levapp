/**
 * auth.register rule 21 (PAD-651, B-528): the sign-up username, shared by web SignUpPage and iOS
 * signup.tsx so the two forms suggest and refuse the same way.
 *
 * A student who typed his email into the username field got the generic characters message and
 * read it as "the app does not accept my gmail". The field is now pre-filled from the name (or the
 * email's local part), and an "@" in it gets its own message.
 */

/** The characters a username may hold (auth.register rules 2–4). */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
export const USERNAME_SUGGESTION_MAX = 30;

function clean(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, (run) => run[0])
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, USERNAME_SUGGESTION_MAX)
    .replace(/[._-]+$/, "");
}

/**
 * Rule 21a: the username a sign-up form suggests — the name, or the email's local part (before "@",
 * cut at the first "+") when the name gives under 3 usable characters; "" when neither does.
 */
export function suggestUsername(name: string, email: string): string {
  const fromName = clean(name);
  if (fromName.length >= 3) return fromName;
  const local = email.split("@")[0].split("+")[0];
  const fromEmail = clean(local);
  return fromEmail.length >= 3 ? fromEmail : "";
}

/**
 * Rule 21b: the message key for a username that breaks the character rule, or null when it keeps
 * it. An "@" means an email was typed into the field, so it names that mistake instead.
 */
export function usernameCharsIssue(username: string): "usernameIsEmail" | "usernameChars" | null {
  if (USERNAME_PATTERN.test(username)) return null;
  return username.includes("@") ? "usernameIsEmail" : "usernameChars";
}
