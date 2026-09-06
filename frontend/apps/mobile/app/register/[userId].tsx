import { useLocalSearchParams } from "expo-router";
import { UniversalLinkHandoff } from "@/features/auth/UniversalLinkHandoff";
import { parseUniversalLink } from "@/lib/universalLinks";

/**
 * Universal-link landing for `https://<domain>/register/:userId` (PAD-184).
 * See app/invite/player/[token].tsx for why this re-parses the path.
 * The real screen is PAD-164; this hands off to the web flow meanwhile.
 */
export default function RegisterLink() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const target = parseUniversalLink(`/register/${userId ?? ""}`);
  return <UniversalLinkHandoff target={target} />;
}
