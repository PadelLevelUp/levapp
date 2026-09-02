import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthContext";
import { deleteAccount } from "@/api/auth";
import { Loader2, Trash2 } from "lucide-react";

/**
 * App Store 5.1.1(v): in-app account deletion. Mirrors the destructive
 * confirm-then-delete flow used elsewhere in Settings (ImportHistorySection's
 * "revert import" AlertDialog) and in TrainingExercisesPage's exercise
 * delete — a single AlertDialog confirm, not a type-to-confirm input. There's
 * no type-to-confirm precedent anywhere in this codebase, and the dialog
 * copy already states the action is permanent and irreversible.
 */
export function AccountSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      setIsDeleteOpen(false);
      toast({ title: t("settings.account.deleteSuccess") });
      logout();
      navigate("/auth");
    } catch {
      toast({
        title: t("settings.account.deleteFailed"),
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="gap-2"
        onClick={() => setIsDeleteOpen(true)}
      >
        <Trash2 className="w-4 h-4" />
        {t("settings.account.deleteAccount")}
      </Button>

      <AlertDialog open={isDeleteOpen} onOpenChange={(o) => !isDeleting && setIsDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.account.deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.account.deleteDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {isDeleting ? t("settings.account.deleting") : t("settings.account.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
