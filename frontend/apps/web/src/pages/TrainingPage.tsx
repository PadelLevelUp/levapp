import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, FolderOpen } from "lucide-react";

export default function TrainingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("training.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("training.subtitle")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => navigate("/training/exercises")}
          >
            <CardContent className="p-6 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Dumbbell className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{t("training.exercisesCard.title")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("training.exercisesCard.description")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => navigate("/training/groups")}
          >
            <CardContent className="p-6 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <FolderOpen className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{t("training.groupsCard.title")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("training.groupsCard.description")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
