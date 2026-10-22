import type { AdminRoleName } from "./api";

/** admin.finance rule 1 (assumption Q4): the lowest role that sees finance; the backend's FINANCE_ROLE. */
export const FINANCE_ROLE: AdminRoleName = "owner";
