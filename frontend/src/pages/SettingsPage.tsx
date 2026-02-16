import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Bell,
  Calendar,
  CreditCard,
  Shield,
  User,
  Palette,
  Save,
  LogOut,
  KeyRound,
  Upload,
  Trash2,
} from "lucide-react";
import { CoachLevelsSection } from "@/components/settings/CoachLevelsSection";

type WeekStart = "monday" | "sunday";
type TimeFormat = "24h" | "12h";
type ThemePref = "system" | "light" | "dark";
type SettingsTab = "profile" | "preferences" | "calendar" | "notifications" | "billing" | "security";

interface CoachSettings {
  // Profile
  name: string;
  email: string;
  phone?: string;
  abbreviation?: string;
  bio?: string;
  avatarUrl?: string;

  // Preferences
  theme: ThemePref;
  timeFormat: TimeFormat;
  weekStart: WeekStart;

  // Calendar defaults
  defaultClassDurationMin: number;
  defaultMaxPlayers: number;
  defaultClassType: "academy" | "private";
  autoFillColor: boolean;

  // Notifications
  notifyUpcomingClass: boolean;
  notifyMissingPlayers: boolean;
  notifyValidationReminders: boolean;
  notifyEmail: boolean;

  // Analytics / misc
  allowAnalytics: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const items: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    { id: "preferences", label: "Preferences", icon: <Palette className="w-4 h-4" /> },
    { id: "calendar", label: "Calendar", icon: <Calendar className="w-4 h-4" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "billing", label: "Billing", icon: <CreditCard className="w-4 h-4" /> },
    { id: "security", label: "Security", icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            active === it.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function isValidImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<SettingsTab>("profile");

  // In real life you load from API
  const [settings, setSettings] = useState<CoachSettings>({
    name: "Coach Name",
    email: "coach@email.com",
    phone: "",
    abbreviation: "CN",
    bio: "",
    avatarUrl: "",

    theme: "system",
    timeFormat: "24h",
    weekStart: "monday",

    defaultClassDurationMin: 90,
    defaultMaxPlayers: 4,
    defaultClassType: "academy",
    autoFillColor: true,

    notifyUpcomingClass: true,
    notifyMissingPlayers: true,
    notifyValidationReminders: true,
    notifyEmail: true,

    allowAnalytics: true,
  });

  /**
   * Avatar state:
   * - avatarFile: what user picked
   * - avatarPreviewUrl: local blob url for immediate preview
   */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const canSubmitPassword = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (newPassword.length < 8) return false;
    return true;
  }, [currentPassword, newPassword, confirmPassword]);

  // ---- Actions you’ll wire to backend/auth later ----

  const handleSave = async () => {
    // 1) Save settings (API call later)
    // 2) If avatarFile exists, upload it and store returned URL
    // Example pseudo:
    // const avatarUrl = avatarFile ? await api.uploadAvatar(avatarFile) : settings.avatarUrl;
    // await api.updateSettings({...settings, avatarUrl});

    toast({
      title: "Settings saved",
      description: avatarFile
        ? "Settings saved. (Avatar upload hook is ready to connect.)"
        : "Your preferences were updated.",
    });

    // If you want to “commit” the avatar preview as if uploaded (mock behavior)
    if (avatarPreviewUrl) {
      setSettings((s) => ({ ...s, avatarUrl: avatarPreviewUrl }));
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
    }
  };

  const handlePickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = (file: File | null) => {
    if (!file) return;
    if (!isValidImageFile(file)) {
      toast({ title: "Invalid file", description: "Please select an image file." });
      return;
    }
    // Optional: size limit (e.g., 5MB)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: "File too large", description: "Max avatar size is 5MB." });
      return;
    }
    setAvatarFile(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    setSettings((s) => ({ ...s, avatarUrl: "" })); // mock removal
    toast({ title: "Avatar removed" });
  };

  const handleChangePassword = async () => {
    // Never change passwords purely client-side.
    // This should call your auth backend: api.changePassword(currentPassword, newPassword)
    setPwLoading(true);
    try {
      // mock success
      await new Promise((r) => setTimeout(r, 400));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated", description: "Your password has been changed." });
    } catch {
      toast({ title: "Password update failed", description: "Please try again.", });
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogout = async () => {
    // Wire this to your auth system:
    // - NextAuth: signOut()
    // - Firebase: auth.signOut()
    // - Custom: clear tokens + navigate to /login
    toast({ title: "Logged out", description: "Logout hook is ready to connect." });
  };

  const avatarSrc = avatarPreviewUrl || settings.avatarUrl || undefined;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your profile, calendar defaults, notifications, and security.
            </p>
          </div>

          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Save changes
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left nav (desktop) */}
          <Card className="lg:col-span-3 h-fit hidden lg:block">
            <CardHeader>
              <CardTitle className="text-base">Sections</CardTitle>
              <CardDescription>Quick navigation</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsNav active={tab} onChange={setTab} />
            </CardContent>
          </Card>

          {/* Main panel */}
          <div className="lg:col-span-9 space-y-4">
            {/* Mobile: dropdown */}
            <div className="lg:hidden">
              <Select value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">Profile</SelectItem>
                  <SelectItem value="preferences">Preferences</SelectItem>
                  <SelectItem value="calendar">Calendar</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PROFILE */}
            {tab === "profile" && (
              <Card>
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>Basic info visible to your players.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar section */}
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={avatarSrc} alt={settings.name} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(settings.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <p className="font-medium">{settings.name}</p>
                      <p className="text-sm text-muted-foreground">{settings.email}</p>
                      {avatarFile && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Selected: {avatarFile.name}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAvatarSelected(e.target.files?.[0] ?? null)}
                      />
                      <Button variant="outline" onClick={handlePickAvatar} className="gap-2">
                        <Upload className="w-4 h-4" />
                        Upload
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleRemoveAvatar}
                        className="gap-2"
                        disabled={!settings.avatarUrl && !avatarPreviewUrl}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={settings.name}
                        onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="abbr">Abbreviation (optional)</Label>
                      <Input
                        id="abbr"
                        placeholder="e.g. PP"
                        value={settings.abbreviation ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, abbreviation: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={settings.email}
                        onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input
                        id="phone"
                        value={settings.phone ?? ""}
                        onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio (optional)</Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell players a bit about you..."
                      value={settings.bio ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, bio: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PREFERENCES */}
            {tab === "preferences" && (
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>How you want the app to behave.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <Select
                        value={settings.theme}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, theme: v as ThemePref }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">System</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Time format</Label>
                      <Select
                        value={settings.timeFormat}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, timeFormat: v as TimeFormat }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Time format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24h</SelectItem>
                          <SelectItem value="12h">12h</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Week starts on</Label>
                      <Select
                        value={settings.weekStart}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, weekStart: v as WeekStart }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Week start" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monday">Monday</SelectItem>
                          <SelectItem value="sunday">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable analytics</p>
                      <p className="text-sm text-muted-foreground">
                        Helps improve the product with anonymous usage data.
                      </p>
                    </div>
                    <Switch
                      checked={settings.allowAnalytics}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, allowAnalytics: v }))}
                    />
                  </div>

                  <Separator />

                  <CoachLevelsSection />
                </CardContent>
              </Card>
            )}

            {/* CALENDAR */}
            {tab === "calendar" && (
              <Card>
                <CardHeader>
                  <CardTitle>Calendar defaults</CardTitle>
                  <CardDescription>Defaults used when creating a new class.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Default class type</Label>
                      <Select
                        value={settings.defaultClassType}
                        onValueChange={(v) =>
                          setSettings((s) => ({
                            ...s,
                            defaultClassType: v as "academy" | "private",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Class type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="academy">Academy</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Default duration (minutes)</Label>
                      <Input
                        type="number"
                        min={30}
                        step={15}
                        value={settings.defaultClassDurationMin}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            defaultClassDurationMin: Number(e.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Default max players</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.defaultMaxPlayers}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            defaultMaxPlayers: Number(e.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">Auto pick color</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically choose a class color when creating.
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoFillColor}
                        onCheckedChange={(v) => setSettings((s) => ({ ...s, autoFillColor: v }))}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    Tip: Connect these to <span className="font-medium text-foreground">AddClassSheet</span> as props later.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* NOTIFICATIONS */}
            {tab === "notifications" && (
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Control reminders and alerts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Upcoming class reminders</p>
                      <p className="text-sm text-muted-foreground">
                        Get reminders before your next classes.
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyUpcomingClass}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyUpcomingClass: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Missing players alerts</p>
                      <p className="text-sm text-muted-foreground">
                        Warn when a scheduled class is not full.
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyMissingPlayers}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyMissingPlayers: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Validation reminders</p>
                      <p className="text-sm text-muted-foreground">
                        Remind you to validate presences after classes.
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyValidationReminders}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyValidationReminders: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Send via email</p>
                      <p className="text-sm text-muted-foreground">
                        Use email in addition to in-app notifications.
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyEmail}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyEmail: v }))}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* BILLING */}
            {tab === "billing" && (
              <Card>
                <CardHeader>
                  <CardTitle>Billing</CardTitle>
                  <CardDescription>Subscription and invoices (placeholder).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Plan</p>
                      <p className="text-sm text-muted-foreground">Coach Pro</p>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>

                  <Button variant="outline" disabled>
                    Manage billing
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* SECURITY */}
            {tab === "security" && (
              <div className="space-y-4">
                {/* Change password */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      Change password
                    </CardTitle>
                    <CardDescription>
                      Use a strong password (min 8 chars). This should call your backend.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        {newPassword.length > 0 && newPassword.length < 8 && (
                          <p className="text-xs text-muted-foreground">
                            Must be at least 8 characters.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm new password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                          <p className="text-xs text-muted-foreground">
                            Passwords don’t match.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleChangePassword}
                        disabled={!canSubmitPassword || pwLoading}
                      >
                        {pwLoading ? "Updating..." : "Update password"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Logout */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LogOut className="w-4 h-4" />
                      Logout
                    </CardTitle>
                    <CardDescription>
                      End your session on this device.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-end">
                    <Button variant="destructive" onClick={handleLogout} className="gap-2">
                      <LogOut className="w-4 h-4" />
                      Logout
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
