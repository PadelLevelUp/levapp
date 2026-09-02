/*
  This is a template — review with legal counsel before publishing.
*/
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const EFFECTIVE_DATE = "July 14, 2026";
const SUPPORT_CONTACT_EMAIL = "privacy@levelup.app";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold">Terms of Service</CardTitle>
            <CardDescription>Effective date: {EFFECTIVE_DATE}</CardDescription>
          </CardHeader>

          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <p>
              These Terms of Service ("Terms") govern your access to and use
              of the LevelUp coaching, scheduling, and messaging platform (the
              "Service"). By creating an account, you agree to these Terms.
              If you do not agree, do not use the Service.
            </p>

            <h2>1. Accounts</h2>
            <p>
              Accounts are created with a username and password (there is no
              third-party/social sign-in). You are responsible for keeping
              your password confidential and for all activity under your
              account. Coach accounts may invite and manage player accounts;
              players may be invited by a coach or register directly.
            </p>

            <h2>2. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>
                Use the Service to send harassing, abusive, defamatory, or
                unlawful messages to other users.
              </li>
              <li>
                Impersonate another person or misrepresent your affiliation
                with a coach, club, or player.
              </li>
              <li>
                Attempt to access another user's account or data without
                authorization.
              </li>
              <li>
                Interfere with or disrupt the Service, including through
                automated scraping or attempts to bypass authentication.
              </li>
            </ul>

            <h2>3. Coach and player content</h2>
            <p>
              Coaches are responsible for the accuracy of class schedules,
              attendance records, and player evaluations they enter. Message
              content sent between coaches and players is the responsibility
              of the sender; LevelUp does not pre-screen messages but may
              review reported content to investigate abuse or comply with
              the law, as described in our{" "}
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </p>

            <h2>4. Your data</h2>
            <p>
              Our{" "}
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>{" "}
              describes what information we collect (account details, optional
              phone number, message content, class/attendance/evaluation
              data), how we use it to provide the Service, and how you can
              delete your account and data from{" "}
              <strong>Settings → Account → Delete account</strong>. We do not
              sell your personal information or share it with advertisers.
            </p>

            <h2>5. Account suspension and termination</h2>
            <p>
              We may suspend or terminate access to the Service for accounts
              that violate these Terms, engage in abusive behavior toward
              other users, or where required to protect the security or
              integrity of the Service. You may delete your own account at
              any time as described above.
            </p>

            <h2>6. Availability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind.
              We aim for reliable availability but do not guarantee
              uninterrupted or error-free operation, and we are not liable
              for scheduling or coaching decisions made using the Service.
            </p>

            <h2>7. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. We will update the
              effective date above when we do. Continued use of the Service
              after a change constitutes acceptance of the updated Terms.
            </p>

            <h2>8. Contact us</h2>
            <p>
              Questions about these Terms can be sent to{" "}
              <a href={`mailto:${SUPPORT_CONTACT_EMAIL}`}>
                {SUPPORT_CONTACT_EMAIL}
              </a>
              .
            </p>

            <p className="pt-4">
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
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

export default TermsPage;
