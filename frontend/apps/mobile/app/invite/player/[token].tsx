import { useLocalSearchParams } from "expo-router";
import { PlayerInviteScreen } from "@/features/auth/PlayerInviteScreen";
import { inviteTokenFromParam } from "@/features/auth/account-setup";

/**
 * Universal-link landing for `https://<domain>/invite/player/:token`.
 *
 * Expo Router strips the origin from an incoming https URL and matches the
 * remaining path against the file tree, so this file IS the linking config —
 * no `prefixes` entry is needed (PAD-184). The path must stay byte-identical to
 * the one claimed in `apps/web/public/.well-known/apple-app-site-association`.
 *
 * The raw param is re-validated rather than trusted (see `inviteTokenFromParam`),
 * so a blank or malformed token renders the invalid-invitation state instead of
 * firing a tokenless request at the API.
 */
export default function PlayerInviteRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  return <PlayerInviteScreen token={inviteTokenFromParam("player", token)} />;
}
