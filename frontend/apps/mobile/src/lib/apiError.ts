/**
 * Turn an axios-style error into something a form can act on.
 *
 * `field` is the input the server named (register 400/409 carry it); `message`
 * is the server's own `error` text when there is one; `routeMissing` is true for
 * a 404/405 — on a route the app expects to exist that means the SERVER is
 * behind the app (e.g. a TestFlight build pointed at production before a
 * feature was promoted), which must never be shown as "not found" or as a
 * generic "check your data" (auth.register rule 10, PAD-225).
 */
export type ApiErrorInfo = {
  status?: number;
  field?: string;
  message?: string;
  network: boolean;
  routeMissing: boolean;
};

export function describeApiError(err: unknown): ApiErrorInfo {
  const response = (err as { response?: { status?: number; data?: unknown } } | undefined)?.response;
  if (!response) return { network: true, routeMissing: false };
  const data = (response.data ?? {}) as { error?: unknown; field?: unknown };
  const status = response.status;
  return {
    status,
    field: typeof data.field === "string" ? data.field : undefined,
    message: typeof data.error === "string" ? data.error : undefined,
    network: false,
    routeMissing: status === 404 || status === 405,
  };
}
