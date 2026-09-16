import { useLocalSearchParams } from "expo-router";
import { RegisterScreen } from "@/features/auth/RegisterScreen";
import {
  registerTokenFromParam,
  registerUserIdFromParam,
} from "@/features/auth/account-setup";

/**
 * Universal-link landing for `https://<domain>/register/:userId?t=<token>`.
 * See `app/invite/player/[token].tsx` for why the params are re-validated.
 * `t` is the account's activation secret (auth.activate rule 8, PAD-254);
 * Expo Router delivers query keys alongside the path param.
 */
export default function RegisterRoute() {
  const { userId, t } = useLocalSearchParams<{
    userId?: string | string[];
    t?: string | string[];
  }>();
  return (
    <RegisterScreen
      userId={registerUserIdFromParam(userId)}
      token={registerTokenFromParam(t)}
    />
  );
}
