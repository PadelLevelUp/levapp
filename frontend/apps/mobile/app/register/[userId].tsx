import { useLocalSearchParams } from "expo-router";
import { RegisterScreen } from "@/features/auth/RegisterScreen";
import { registerUserIdFromParam } from "@/features/auth/account-setup";

/**
 * Universal-link landing for `https://<domain>/register/:userId`.
 * See `app/invite/player/[token].tsx` for why the param is re-validated.
 */
export default function RegisterRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string | string[] }>();
  return <RegisterScreen userId={registerUserIdFromParam(userId)} />;
}
