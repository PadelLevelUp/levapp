import { useLocalSearchParams } from "expo-router";
import { CoachInviteScreen } from "@/features/auth/CoachInviteScreen";
import { inviteTokenFromParam } from "@/features/auth/account-setup";

/**
 * Universal-link landing for `https://<domain>/invite/coach/:token`.
 * See `app/invite/player/[token].tsx` for why the param is re-validated.
 */
export default function CoachInviteRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  return <CoachInviteScreen token={inviteTokenFromParam("coach", token)} />;
}
