import { api } from "./client";

export async function checkFieldAvailable(
  model: string,
  field: string,
  value: string,
  // PAD-17: optional coach id used to scope warn-only checks (e.g. the player
  // name duplicate warning) to the requesting coach's own roster. Unique-field
  // checks (username/email) ignore it and stay global on the backend.
  scope?: string | number | null,
): Promise<string | null> {
  try {
    await api.post("/app/check_field_available", {
      model,
      field,
      value,
      ...(scope != null && scope !== "" ? { scope } : {}),
    });
    return null;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      return err.response.data.message;
    }
    return null;
  }
}
