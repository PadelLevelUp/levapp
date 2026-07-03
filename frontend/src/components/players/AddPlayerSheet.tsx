import { useEffect, useState } from "react";
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
  levels: CoachLevel[];
  initialValues?: Partial<AddPlayerInput>; // optional (nice for future "edit")
}

export function AddPlayerSheet({
  open,
  onClose,
  onSave,
  levels,
  initialValues,
}: AddPlayerSheetProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [username, setUsername] = useState(initialValues?.username ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [levelId, setLevelId] = useState<string>(initialValues?.levelId ?? "");
  const [side, setSide] = useState<PlayerSide | "">(initialValues?.side ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const usernameCheck = useFieldAvailability("user", "username", username);
  const emailCheck = useFieldAvailability("user", "email", email);

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

  return (
    <Sheet open={open} onOpenChange={(next) => !next && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New player</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="player-name">Name</Label>
            <Input
              id="player-name"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-username">Username</Label>
            <div className="relative">
              <Input
                id="player-username"
                placeholder="e.g. johndoe"
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
            <Label htmlFor="player-email">Email (optional)</Label>
            <div className="relative">
              <Input
                id="player-email"
                placeholder="e.g. john@email.com"
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
            <Label htmlFor="player-phone">Phone (optional)</Label>
            <Input
              id="player-phone"
              placeholder="e.g. +351 9xx xxx xxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Level (optional)</Label>
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No levels defined yet — create levels in Settings to assign one.
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
                No levels defined yet.{" "}
                <a href="/settings" className="underline underline-offset-2">
                  Create levels in Settings
                </a>{" "}
                to assign one.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Side (optional)</Label>
            <Select
              value={side}
              onValueChange={(v) => setSide(v as PlayerSide)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-notes">Notes (optional)</Label>
            <Input
              id="player-notes"
              placeholder="Anything you want to remember..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || hasFieldError || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create player
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
