import type { DemoPedido } from "@/lib/demoRequest";

import type { Audience } from "../audience";

/** What every audience page gets from SitePage. */
export interface AudiencePageProps {
  /** Opens the demo dialog; `null` records no HubSpot `pedido` (a general contact). */
  onDemo: (pedido?: DemoPedido | null) => void;
  onSwitch: (next: Audience) => void;
}
