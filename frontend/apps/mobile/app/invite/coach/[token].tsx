import { useLocalSearchParams } from "expo-router";
import { UniversalLinkHandoff } from "@/features/auth/UniversalLinkHandoff";
import { parseUniversalLink } from "@/lib/universalLinks";

/**
 * Universal-link landing for `https://<domain>/invite/coach/:token` (PAD-184).
 * See app/invite/player/[token].tsx for why this re-parses the path.
 * The real screen is PAD-164; this hands off to the web flow meanwhile.
 */
export default function CoachInviteLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const target = parseUniversalLink(`/invite/coach/${token ?? ""}`);
  return <UniversalLinkHandoff target={target} />;
}
