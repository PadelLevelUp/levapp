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

export interface AddPlayerFieldError {
  field: "username" | "email";
  message: string;
}

interface AddPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AddPlayerInput) => Promise<boolean>;
  levels: CoachLevel[];
  initialValues?: Partial<AddPlayerInput>; // optional (nice for future "edit")
  fieldError?: AddPlayerFieldError | null;
  onClearFieldError?: () => void;
}

export function AddPlayerSheet({
  open,
  onClose,
  onSave,
  levels,
  initialValues,
  fieldError,
  onClearFieldError,
}: AddPlayerSheetProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [username, setUsername] = useState(initialValues?.username ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [levelId, setLevelId] = useState<string>(initialValues?.levelId ?? "");
  const [side, setSide] = useState<PlayerSide | "">(initialValues?.side ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [saving, setSaving] = useState(false);

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
    // Reset to defaults so next open is clean (unless initialValues used)
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
    if (!name.trim()) return;

    setSaving(true);
    try {
      const success = await onSave({
        name: name.trim(),
        isActive: true,
        username: username.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        levelId: levelId || undefined,
        side: side || undefined,
        notes: notes.trim() || undefined,
      });

      if (success) {
        handleClose();
      }
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
            <Input
              id="player-username"
              placeholder="e.g. johndoe"
              value={username}
              className={fieldError?.field === "username" ? "border-red-500 focus-visible:ring-red-500" : ""}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldError?.field === "username") onClearFieldError?.();
              }}
            />
            {fieldError?.field === "username" && (
              <p className="text-sm text-red-500">{fieldError.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-email">Email (optional)</Label>
            <Input
              id="player-email"
              placeholder="e.g. john@email.com"
              value={email}
              className={fieldError?.field === "email" ? "border-red-500 focus-visible:ring-red-500" : ""}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldError?.field === "email") onClearFieldError?.();
              }}
            />
            {fieldError?.field === "email" && (
              <p className="text-sm text-red-500">{fieldError.message}</p>
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
                {levels.map((lvl) => (
                  <SelectItem key={lvl.id} value={lvl.id}>
                    {lvl.code} – {lvl.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create player
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
