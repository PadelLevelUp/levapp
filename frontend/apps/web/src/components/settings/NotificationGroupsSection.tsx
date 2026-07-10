import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { NotificationGroup } from "@/types";

const GROUP_DESCRIPTION_KEYS: Record<string, string> = {
  same_level: "settings.notificationGroups.sameLevel",
  recent_absences: "settings.notificationGroups.recentAbsences",
  justified_absences: "settings.notificationGroups.justifiedAbsences",
  all_students: "settings.notificationGroups.allStudents",
};

const GROUP_LABEL_KEYS: Record<string, string> = {
  same_level: "settings.notificationGroups.labels.sameLevel",
  recent_absences: "settings.notificationGroups.labels.recentAbsences",
  justified_absences: "settings.notificationGroups.labels.justifiedAbsences",
  all_students: "settings.notificationGroups.labels.allStudents",
};

interface NotificationGroupsSectionProps {
  groups: NotificationGroup[];
  onChange: (groups: NotificationGroup[]) => void;
  disabled?: boolean;
}

export function NotificationGroupsSection({
  groups,
  onChange,
  disabled,
}: NotificationGroupsSectionProps) {
  const { t } = useTranslation();
  const toggleGroup = (id: string, enabled: boolean) => {
    onChange(groups.map((g) => (g.id === id ? { ...g, enabled } : g)));
  };

  return (
    <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {groups.map((group) => (
        <div
          key={group.id}
          className="flex items-center gap-3 p-3 rounded-lg border"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 opacity-40" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {GROUP_LABEL_KEYS[group.id] ? t(GROUP_LABEL_KEYS[group.id]) : group.label}
            </p>
            {GROUP_DESCRIPTION_KEYS[group.id] && (
              <p className="text-xs text-muted-foreground">
                {t(GROUP_DESCRIPTION_KEYS[group.id])}
              </p>
            )}
          </div>
          <Switch
            checked={group.enabled}
            onCheckedChange={(val) => toggleGroup(group.id, val)}
          />
        </div>
      ))}
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("settings.notificationGroups.empty")}</p>
      )}
    </div>
  );
}
