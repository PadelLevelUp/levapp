import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, GraduationCap, Send } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnderstandInvitesTutorial } from "@/components/settings/tutorials/UnderstandInvitesTutorial";

/**
 * PAD-196 — Settings › Tutorials (settings.tutorials rules 1–2).
 *
 * A static registry of interactive walkthroughs. The next tutorial is one row
 * here and one component under `./tutorials/`, never a new Settings section.
 * v1 has exactly one entry: "Understand invites".
 */
type TutorialId = "understand-invites";

type TutorialDef = {
  id: TutorialId;
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
};

const TUTORIALS: TutorialDef[] = [
  {
    id: "understand-invites",
    titleKey: "tutorials.understandInvites.title",
    descriptionKey: "tutorials.understandInvites.description",
    icon: <Send className="w-4 h-4" />,
  },
];

export function TutorialsSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<TutorialId | null>(null);

  if (open === "understand-invites") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          data-testid="tutorial-back"
          onClick={() => setOpen(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("tutorials.back")}
        </button>
        <UnderstandInvitesTutorial />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5" />
          {t("tutorials.title")}
        </CardTitle>
        <CardDescription>{t("tutorials.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {TUTORIALS.map((tutorial) => (
          <button
            key={tutorial.id}
            type="button"
            data-testid={`tutorial-${tutorial.id}`}
            onClick={() => setOpen(tutorial.id)}
            className="w-full flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left hover:bg-muted transition-colors"
          >
            <span className="text-primary">{tutorial.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t(tutorial.titleKey)}</span>
              <span className="block text-xs text-muted-foreground">
                {t(tutorial.descriptionKey)}
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
