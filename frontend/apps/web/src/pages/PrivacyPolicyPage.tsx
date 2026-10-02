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
const PRIVACY_CONTACT_EMAIL = "privacy@levelup.app";

/**
 * PAD-469: the website's HubSpot tracking and demo form (auth.landing-page
 * rules 10–13). One constant, so a wording change from the owner's legal
 * review is a one-line edit. Pending owner approval before prod promotion.
 */
const WEBSITE_TRACKING_NOTICE =
  "The app itself contains no advertising or analytics SDKs and uses no device advertising identifiers (IDFA). " +
  "On our public website we use HubSpot (HubSpot, Inc., EU data centre) to measure visits and to receive demo requests. " +
  "Tracking cookies are set only if you accept them in the cookie banner, and you can withdraw that consent at any time under \"Cookie preferences\" at the bottom of the home page; " +
  "with your consent, HubSpot receives the pages you visit, your IP address, browser details, the referring page and its own visitor cookie. " +
  "Opening the demo request form loads it from HubSpot, which may set a short-lived security cookie on its own domain; what you submit in that form is stored in HubSpot.";

/**
 * PAD-471: a coach's own sign-up data goes to the sales CRM
 * (auth.coach-crm-sync). One constant, next to the website notice, for the
 * owner's legal review. Pending owner approval before prod promotion.
 */
const COACH_CRM_NOTICE =
  "When a coach creates an account, we record their name, email, phone (if given) and account status in our CRM (HubSpot, EU data centre) to follow up on their use of LevApp; we never share their students' data.";

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold">Privacy Policy</CardTitle>
            <CardDescription>Effective date: {EFFECTIVE_DATE}</CardDescription>
          </CardHeader>

          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <p>
              LevelUp ("LevelUp", "we", "us", or "our") provides a scheduling,
              coaching, and communication platform for padel coaches and their
              players (the "Service"). This Privacy Policy explains what
              information we collect, how we use it, and the choices you have.
              By creating an account or otherwise using the Service, you agree
              to the practices described here.
            </p>

            <h2>1. Information we collect</h2>
            <p>We collect the following categories of information:</p>
            <ul>
              <li>
                <strong>Account information</strong> — your name, username,
                email address, and password (stored as a salted hash, never
                in plain text).
              </li>
              <li>
                <strong>Phone number (optional)</strong> — if you choose to
                provide it, used for coach-player communication and contact
                purposes.
              </li>
              <li>
                <strong>Message content</strong> — the content of messages you
                exchange with your coach or players within the app.
              </li>
              <li>
                <strong>Class, attendance, and evaluation data</strong> —
                schedules, class rosters, attendance records, skill levels,
                and coaching evaluations/notes entered by your coach.
              </li>
            </ul>
            <p>
              We do not use any third-party login (social sign-in) — accounts
              are created with a username and password only.
            </p>
            <p>{WEBSITE_TRACKING_NOTICE}</p>
            <p>{COACH_CRM_NOTICE}</p>

            <h2>2. How we use your information</h2>
            <p>We use the information above solely to operate the Service:</p>
            <ul>
              <li>To create and maintain your account and authenticate you.</li>
              <li>
                To let coaches schedule classes, track attendance, and record
                evaluations for their players.
              </li>
              <li>
                To deliver in-app and, where enabled, email notifications
                about classes, attendance, and messages.
              </li>
              <li>
                To enable direct messaging between coaches and their players.
              </li>
            </ul>

            <h2>3. We do not sell your data</h2>
            <p>
              We do not sell, rent, or share your personal information with
              advertisers or data brokers. We do not use your data to serve
              third-party ads. Information you provide is used exclusively to
              provide the coaching and scheduling service described above.
            </p>

            <h2>4. Message content between coaches and players</h2>
            <p>
              Messages you send through the Service are visible to the coach
              or player you are messaging, and stored so that conversation
              history is available to both participants. Messages are not
              reviewed by LevelUp staff except as needed to investigate abuse
              reports, comply with law, or maintain the security of the
              Service.
            </p>

            <h2>5. Data retention</h2>
            <p>
              We retain your account and activity data for as long as your
              account is active, and afterwards for as long as needed to
              provide the Service, resolve disputes, and comply with our legal
              obligations. Message history is retained so that the other
              participant in a conversation continues to see it, even after
              your own account has been deleted (see below).
            </p>

            <h2>6. Deleting your account and your data</h2>
            <p>
              You can delete your account at any time from within the app:
              go to <strong>Settings → Account</strong> and select{" "}
              <strong>"Delete account"</strong>. Confirming this action:
            </p>
            <ul>
              <li>
                Immediately signs you out and invalidates your session on
                every device.
              </li>
              <li>
                Anonymizes your personal information (name, email, phone
                number, and profile photo) so it is no longer identifiable.
              </li>
              <li>
                Removes your account from coach/player lists so it can no
                longer be selected or contacted going forward.
              </li>
            </ul>
            <p>
              We retain the anonymized record (rather than deleting the row
              outright) only so that existing class, attendance, and message
              history remains coherent for other users (e.g. a coach's past
              class rosters, or the other side of a conversation) — no
              identifiable personal information remains associated with it.
              If you would like additional data removed beyond what the
              in-app flow anonymizes, contact us at the address below.
            </p>

            <h2>7. Security</h2>
            <p>
              We use industry-standard measures — including password hashing
              and encrypted connections (HTTPS) — to protect your
              information. No method of transmission or storage is 100%
              secure, and we cannot guarantee absolute security.
            </p>

            <h2>8. Children's privacy</h2>
            <p>
              The Service is intended for use by coaches and players managing
              padel coaching relationships. It is not directed at children
              under 13, and we do not knowingly collect personal information
              from children under 13 without appropriate consent.
            </p>

            <h2>9. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              update the effective date above when we do. Continued use of
              the Service after a change constitutes acceptance of the
              updated policy.
            </p>

            <h2>10. Contact us</h2>
            <p>
              If you have questions about this Privacy Policy or how your
              data is handled, contact us at{" "}
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
                {PRIVACY_CONTACT_EMAIL}
              </a>
              .
            </p>

            <p className="pt-4">
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

export default PrivacyPolicyPage;
