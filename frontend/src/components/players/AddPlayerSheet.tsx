import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CoachLevel, PlayerSide } from "@/types";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFieldAvailability } from "@/hooks/useFieldAvailability";
import { LevelLabel } from "@/components/LevelLabel";

export interface AddPlayerInput {
  name: string;
  isActive: boolean;
  username?: string,
  email?: string;
  phone?: string;
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
}

interface AddPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AddPlayerInput) => Promise<void>;
  onInvite?: (data: {
    name: string;
    levelId?: string;
    side?: string;
    notes?: string;
    email?: string;
  }) => Promise<void>;
  levels: CoachLevel[];
  // PAD-17: the requesting coach's id, used to scope the duplicate player-name
  // warning to this coach's own roster (avoids false cross-club warnings).
  coachId?: string | number | null;
  initialValues?: Partial<AddPlayerInput>; // optional (nice for future "edit")
}

export function AddPlayerSheet({
  open,
  onClose,
  onSave,
  onInvite,
  levels,
  coachId,
  initialValues,
}: AddPlayerSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [username, setUsername] = useState(initialValues?.username ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [levelId, setLevelId] = useState<string>(initialValues?.levelId ?? "");
  const [side, setSide] = useState<PlayerSide | "">(initialValues?.side ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  const usernameCheck = useFieldAvailability("user", "username", username);
  const emailCheck = useFieldAvailability("user", "email", email);
  // PAD-17: name is not unique — this is a WARN, not a hard error. It surfaces a
  // non-blocking message and is intentionally excluded from hasFieldError so the
  // coach can still proceed (e.g. two real students who share a name). The check
  // is scoped to this coach's own roster so a same-named player at another club
  // does not trigger a false warning.
  const nameCheck = useFieldAvailability("user", "name", name, coachId);

  const hasFieldError = !!usernameCheck.error || !!emailCheck.error;

  // Sync form when opening (and when initialValues changes)
  useEffect(() => {
    if (!open) return;

    setName(initialValues?.name ?? "");
    setUsername(initialValues?.username ?? "");
    setEmail(initialValues?.email ?? "");
    setPhone(initialValues?.phone ?? "");
    setLevelId(initialValues?.levelId ?? "");
    setSide(initialValues?.side ?? "");
    setNotes(initialValues?.notes ?? "");
  }, [open, initialValues]);

  const handleClose = () => {
    setName("");
    setUsername("");
    setEmail("");
    setPhone("");
    setLevelId("");
    setSide("");
    setNotes("");
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim() || hasFieldError) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        isActive: true,
        username: username.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        levelId: levelId || undefined,
        side: side || undefined,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!name.trim() || !onInvite) return;

    setInviting(true);
    try {
      await onInvite({
        name: name.trim(),
        email: email.trim() || undefined,
        levelId: levelId || undefined,
        side: side || undefined,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } finally {
      setInviting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("players.newPlayer")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="player-name">{t("players.name")}</Label>
            <div className="relative">
              <Input
                id="player-name"
                placeholder={t("players.namePlaceholder")}
                value={name}
                className={nameCheck.error ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                onChange={(e) => setName(e.target.value)}
              />
              {nameCheck.checking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {nameCheck.error && (
              <p className="text-sm text-amber-600">
                {nameCheck.error}. {t("players.nameWarningSuffix")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-username">{t("players.username")}</Label>
            <div className="relative">
              <Input
                id="player-username"
                placeholder={t("players.usernamePlaceholder")}
                value={username}
                className={usernameCheck.error ? "border-red-500 focus-visible:ring-red-500" : ""}
                onChange={(e) => setUsername(e.target.value)}
              />
              {usernameCheck.checking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {usernameCheck.error && (
              <p className="text-sm text-red-500">{usernameCheck.error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-email">{t("players.emailOptional")}</Label>
            <div className="relative">
              <Input
                id="player-email"
                placeholder={t("players.emailPlaceholder")}
                value={email}
                className={emailCheck.error ? "border-red-500 focus-visible:ring-red-500" : ""}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailCheck.checking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {emailCheck.error && (
              <p className="text-sm text-red-500">{emailCheck.error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-phone">{t("players.phoneOptional")}</Label>
            <Input
              id="player-phone"
              placeholder={t("players.phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("players.levelOptional")}</Label>
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger>
                <SelectValue placeholder={t("players.selectLevel")} />
              </SelectTrigger>
              <SelectContent>
                {levels.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {t("players.noLevelsSelectHint")}
                  </div>
                ) : (
                  levels.map((lvl) => (
                    <SelectItem key={lvl.id} value={lvl.id}>
                      <LevelLabel code={lvl.code} label={lvl.label} />
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {levels.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("players.noLevelsHintPrefix")}{" "}
                <a href="/settings" className="underline underline-offset-2">
                  {t("players.createLevelsInSettings")}
                </a>{" "}
                {t("players.noLevelsHintSuffix")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("players.sideOptional")}</Label>
            <Select
              value={side}
              onValueChange={(v) => setSide(v as PlayerSide)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("players.selectSide")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{t("players.sideLeft")}</SelectItem>
                <SelectItem value="right">{t("players.sideRight")}</SelectItem>
                <SelectItem value="both">{t("players.sideBoth")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-notes">{t("players.notesOptional")}</Label>
            <Input
              id="player-notes"
              placeholder={t("players.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={saving || inviting}>
            {t("common.cancel")}
          </Button>
          {onInvite && (
            <Button
              variant="secondary"
              onClick={handleInvite}
              disabled={!name.trim() || saving || inviting}
            >
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("players.createAndInvite")}
            </Button>
          )}
          <Button onClick={handleSave} disabled={!name.trim() || hasFieldError || saving || inviting}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("players.createPlayer")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
