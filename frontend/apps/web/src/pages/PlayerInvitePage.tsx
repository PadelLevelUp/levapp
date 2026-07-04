import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  getPlayerInvitation,
  acceptPlayerInvitation,
} from "@/api/playerInvitations";
import { useAuth } from "@/auth/AuthContext";

type InvitationStatus = "loading" | "valid" | "invalid";

const acceptSchema = z
  .object({
    username: z.string().min(3, "Username must have at least 3 characters"),
    password: z.string().min(6, "Password must have at least 6 characters"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

const PlayerInvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const [status, setStatus] = useState<InvitationStatus>("loading");
  const [playerName, setPlayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    password: "",
    repeatPassword: "",
  });

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const fetchInvitation = async () => {
      try {
        const data = await getPlayerInvitation(token);
        setPlayerName(data.playerName);
        setStatus("valid");
      } catch {
        // 404 (unknown) or 410 (used / expired)
        setStatus("invalid");
      }
    };

    fetchInvitation();
  }, [token]);

  const validateForm = () => {
    const result = acceptSchema.safeParse(form);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        newErrors[String(err.path[0])] = err.message;
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !validateForm()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { accessToken } = await acceptPlayerInvitation(token, {
        username: form.username,
        password: form.password,
      });

      toast({
        title: "Welcome!",
        description: "Your profile is ready.",
      });

      await login(accessToken);
      navigate("/");
    } catch (error: any) {
      const code = error?.response?.status;
      if (code === 409) {
        setSubmitError("This username is already taken. Please choose another one.");
      } else if (code === 404 || code === 410) {
        setStatus("invalid");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">
              Invalid invitation
            </CardTitle>
            <CardDescription>
              This invitation is invalid or no longer valid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Go to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Complete your profile, {playerName}
          </CardTitle>
          <CardDescription className="text-center">
            Choose a username and password to finish setting up your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: "username", label: "Username" },
              { id: "password", label: "Password", type: "password" },
              {
                id: "repeatPassword",
                label: "Repeat Password",
                type: "password",
              },
            ].map(({ id, label, type = "text" }) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type={type}
                  value={form[id as keyof typeof form]}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      [id]: e.target.value,
                    }));
                    setErrors((prev) => ({ ...prev, [id]: undefined }));
                  }}
                />
                {errors[id] && (
                  <p className="text-sm text-destructive">{errors[id]}</p>
                )}
              </div>
            ))}

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Completing…" : "Complete profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlayerInvitePage;
