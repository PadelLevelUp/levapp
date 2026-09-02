import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SUPPORT_CONTACT_EMAIL = "padellevelup2026@gmail.com";

const SupportPage = () => {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold">Support</CardTitle>
            <CardDescription>PadelLevelUp help &amp; contact</CardDescription>
          </CardHeader>

          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <h2>How to get help</h2>
            <p>
              For questions, bug reports, or help using PadelLevelUp, contact
              us at{" "}
              <a href={`mailto:${SUPPORT_CONTACT_EMAIL}`}>
                {SUPPORT_CONTACT_EMAIL}
              </a>{" "}
              and we'll get back to you as soon as possible.
            </p>

            <h2>Contact</h2>
            <p>
              Email:{" "}
              <a href={`mailto:${SUPPORT_CONTACT_EMAIL}`}>
                {SUPPORT_CONTACT_EMAIL}
              </a>
            </p>

            <p className="pt-4">
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              {" · "}
              <Link to="/terms" className="text-primary underline">
                Terms of Service
              </Link>
              {" · "}
              <Link to="/auth" className="text-primary underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupportPage;
