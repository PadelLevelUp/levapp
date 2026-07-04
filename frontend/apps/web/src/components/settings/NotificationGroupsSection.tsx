import { GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { NotificationGroup } from "@/types";

const GROUP_DESCRIPTIONS: Record<string, string> = {
  same_level: "Students with the same level as the class",
  recent_absences: "Students who missed a class recently",
  justified_absences: "Students with at least one justified absence",
  all_students: "All eligible students not already in the class",
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
            <p className="text-sm font-medium">{group.label}</p>
            {GROUP_DESCRIPTIONS[group.id] && (
              <p className="text-xs text-muted-foreground">
                {GROUP_DESCRIPTIONS[group.id]}
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
        <p className="text-sm text-muted-foreground">No groups configured.</p>
      )}
    </div>
  );
}
