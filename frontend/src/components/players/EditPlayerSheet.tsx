import { useEffect, useMemo, useState } from "react";
import type { CoachLevel, PlayerSide } from "@/types";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
  Mail,
  Phone,
  UserX,
  Copy,
  Check,
  Pencil,
  Trash2,
} from "lucide-react";

export interface EditPlayerInput {
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
  isActive?: boolean;
}

interface EditPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditPlayerInput) => void;
  onDelete?: () => void;

  levels: CoachLevel[];
  initialValues?: Partial<EditPlayerInput>;
}

export function EditPlayerSheet({
  open,
  onClose,
  onSave,
  onDelete,
  levels,
  initialValues,
}: EditPlayerSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [levelId, setLevelId] = useState("");
  const [side, setSide] = useState<PlayerSide | "">("");
  const [notes, setNotes] = useState("");

  const isInactive = !initialValues.isActive;

  useEffect(() => {
    if (!open) return;

    setIsEditing(false);

    setName(initialValues?.name ?? "");
    setUsername(initialValues?.username ?? "");
    setEmail(initialValues?.email ?? "");
    setPhone(initialValues?.phone ?? "");
    setLevelId(initialValues?.levelId ?? "");
    setSide(initialValues?.side ?? "");
    setNotes(initialValues?.notes ?? "");
  }, [open, initialValues]);

  const initials = useMemo(() => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [name]);

  const levelLabel = levels.find((l) => l.id === levelId.toString());

  const inviteLink = `${window.location.origin}/invite/${username || "player"}`;

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      username: username.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      levelId: levelId || undefined,
      side: side || undefined,
      notes: notes.trim() || undefined,
    });

    setIsEditing(false);
    onClose();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Player details</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* PLAYER HEADER */}
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold h-10 px-2"
                  placeholder="Player name"
                />
              ) : (
                <p className="text-lg font-semibold">
                  {name || "Unnamed player"}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                {levelLabel && (
                  <Badge variant="outline">{levelLabel.code}</Badge>
                )}
                {side && (
                  <Badge variant="secondary">
                    {side === "left" ? "Left" : "Right"}
                  </Badge>
                )}
                {isInactive && (
                  <Badge variant="destructive" className="gap-1">
                    <UserX className="h-3 w-3" />
                    No account
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* INACTIVE SECTION */}
          {isInactive && (
            <div className="rounded-lg border border-dashed border-warning bg-warning/5 p-4 space-y-3">
              <div className="flex gap-2">
                <UserX className="h-4 w-4 text-warning mt-0.5" />
                <div>
                  <p className="text-sm font-medium">
                    This player doesn’t have an account
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Share this link so they can register.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* CONTACT INFO */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Contact information
            </p>
          </div>

            <div className="flex items-center gap-2">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 text-muted-foreground font-medium">@</span>
                {isEditing && isInactive ? (
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} />
                ) : (
                  <span>{username || "No username"}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {isEditing && isInactive ? (
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                ) : (
                  <span>{email || "No email"}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {isEditing && isInactive ? (
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                ) : (
                  <span>{phone || "No phone"}</span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* CONFIGURATION */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              Configuration
            </p>

            <div className="space-y-3">
              <div>
                <Label>Level</Label>
                {isEditing ? (
                  <Select value={levelId.toString()} onValueChange={setLevelId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-1">
                    {levelLabel?.label || "—"}
                  </p>
                )}
              </div>

              <div>
                <Label>Preferred side</Label>
                {isEditing ? (
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
                ) : (
                  <p className="text-sm mt-1">
                    {side ? (side === "left" ? "Left" : "Right") : "—"}
                  </p>
                )}
              </div>

              <div>
                <Label>Notes</Label>
                {isEditing ? (
                  <Input
                    id="player-notes"
                    placeholder="Anything you want to remember..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                ) : (
                  <p className="text-sm mt-1">
                    <span>{notes || "No notes"}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <SheetFooter className="mt-6 flex gap-2">
          {!isEditing ? (
            <>
              <Button
                className="flex-1"
                size="lg"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              {onDelete && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save changes</Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
