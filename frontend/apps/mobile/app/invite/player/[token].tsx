import { useLocalSearchParams } from "expo-router";
import { UniversalLinkHandoff } from "@/features/auth/UniversalLinkHandoff";
import { parseUniversalLink } from "@/lib/universalLinks";

/**
 * Universal-link landing for `https://<domain>/invite/player/:token` (PAD-184).
 *
 * Expo Router strips the origin from an incoming https URL and matches the
 * remaining path against the file tree, so this file IS the linking config —
 * no `prefixes` entry is needed. Re-parsing the reconstructed path (rather than
 * trusting the raw param) reuses the one validator the unit test pins, so a
 * blank or malformed token renders the invalid state instead of opening a
 * tokenless web URL.
 *
 * The real screen is PAD-164; this hands off to the web flow meanwhile.
 */
export default function PlayerInviteLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const target = parseUniversalLink(`/invite/player/${token ?? ""}`);
  return <UniversalLinkHandoff target={target} />;
}
