import { useEffect, useState } from "react";

import { getNotificationConfig } from "@/api/notificationEngine";

export function useAutoInviteEnabled(enabled = true) {
  const [autoInviteEnabled, setAutoInviteEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    getNotificationConfig()
      .then((config) => {
        if (mounted) {
          setAutoInviteEnabled(config.autoNotifyEnabled);
        }
      })
      .catch(() => {
        if (mounted) {
          setAutoInviteEnabled(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return autoInviteEnabled;
}
