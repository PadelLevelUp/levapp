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
import { registerSchema } from "@levelup/validation";
import { registerUser, activateAccount } from "@/api/register";

type RegistrationStatus = "loading" | "ok" | "already-registered" | "invalid";

const RegisterPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RegistrationStatus>("loading");

  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    repeatPassword: "",
  });

  useEffect(() => {
    if (!userId) return;

    const fetchUser = async () => {
      try {
        const data = await registerUser(userId);

        if (data.isActive) {
          setStatus("already-registered");
          return;
        }

        setForm((prev) => ({
          ...prev,
          name: data.name ?? "",
          username: data.username ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
        }));
      } catch {
        toast({
          variant: "destructive",
          title: "Invalid registration link",
          description: "This user is already active or does not exist.",
        });
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, navigate, toast]);

  const validateForm = () => {
    const result = registerSchema.safeParse(form);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        newErrors[err.path[0]] = err.message;
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !validateForm()) return;

    setSubmitting(true);

    try {
      await activateAccount({
        userId,
        content: {
          name: form.name,
          username: form.username,
          email: form.email,
          phone: form.phone,
          password: form.password,
        },
      });

      toast({
        title: "Account activated!",
        description: "You can now log in.",
      });

      navigate("/auth");
    } catch {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (status === "already-registered") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Already registered
            </CardTitle>
            <CardDescription>
              This user already has an active account.
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

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">
              Invalid link
            </CardTitle>
            <CardDescription>
              This registration link is invalid or expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Go back
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
            Complete Registration
          </CardTitle>
          <CardDescription className="text-center">
            Set your details to activate your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: "name", label: "Name" },
              { id: "username", label: "Username" },
              { id: "email", label: "Email" },
              { id: "phone", label: "Phone" },
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
                  value={(form as any)[id]}
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

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Activating…" : "Activate account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterPage;
