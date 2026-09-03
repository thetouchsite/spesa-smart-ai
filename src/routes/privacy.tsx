import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Spesa Smart" },
      {
        name: "description",
        content:
          "How Spesa Smart collects, uses, and protects your information. Read our privacy policy for full details.",
      },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Privacy Policy — Spesa Smart" },
      {
        property: "og:description",
        content:
          "How Spesa Smart collects, uses, and protects your information.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "13 July 2026";
const CONTACT_EMAIL = "privacy@spesasmart.app";

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-16">
        <nav className="mb-8 text-sm">
          <Link to="/" className="text-primary hover:underline">
            ← Back to app
          </Link>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <p>
              This Privacy Policy explains how Spesa Smart ("we", "us", "our",
              the "App") handles information when you use our mobile and web
              application. We designed Spesa Smart to work with as little
              personal data as possible.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">
              1. Information we collect
            </h2>
            <p className="mb-3">
              We collect only what is needed to generate your personalized meal
              and grocery plan.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Plan inputs you provide:</strong> weekly budget,
                household size, dietary preferences, cuisine, and similar
                choices you enter during onboarding.
              </li>
              <li>
                <strong>Approximate location (optional):</strong> a city name
                or, if you grant permission, coarse GPS coordinates used only
                to suggest nearby supermarkets and localized prices. You can
                use the App without sharing location.
              </li>
              <li>
                <strong>Locally stored plans:</strong> generated meal plans
                and shopping lists are stored on your device. If you enable
                cloud sync (when available) they are stored in your account.
              </li>
              <li>
                <strong>Technical data:</strong> anonymous device, language,
                and crash information used to keep the App stable.
              </li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> collect government IDs, payment card
              numbers, contacts, photos, health data, or precise background
              location.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">
              2. How we use your information
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Generate your personalized meal and grocery plan.</li>
              <li>Estimate prices and savings for nearby supermarkets.</li>
              <li>Improve the App's stability, performance, and translations.</li>
              <li>Respond to your support requests.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information and we do not use it
              for third-party advertising.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">
              3. Third-party services
            </h2>
            <p className="mb-3">
              To provide core features, some data may be processed by trusted
              service providers acting on our behalf:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>AI providers</strong> to generate meal suggestions and
                recipes from your anonymous plan inputs.
              </li>
              <li>
                <strong>Map / geocoding providers</strong> (e.g. OpenStreetMap
                Nominatim) to convert a city name into an approximate location.
              </li>
              <li>
                <strong>Cloud hosting</strong> for the website, APIs, and, if
                you sign in, your saved plans.
              </li>
            </ul>
            <p className="mt-3">
              These providers are contractually required to protect your data
              and only use it to deliver their service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">4. Data retention</h2>
            <p>
              Plan inputs and generated plans are kept on your device until
              you delete them or uninstall the App. If you use an account,
              you can delete your account and associated data at any time by
              contacting us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline"
              >
                {CONTACT_EMAIL}
              </a>
              . Anonymous technical logs are retained for a limited period for
              debugging and abuse prevention.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">5. Your rights</h2>
            <p>
              Depending on where you live (including under GDPR in the EU and
              CCPA in California) you have the right to access, correct,
              export, or delete your personal information, and to object to
              or restrict certain processing. To exercise these rights, email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">6. Children</h2>
            <p>
              Spesa Smart is not directed to children under 13 (or the
              equivalent minimum age in your country) and we do not knowingly
              collect their personal information.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">7. Security</h2>
            <p>
              We use industry-standard technical and organizational measures
              to protect your information, including encryption in transit.
              No method of transmission or storage is 100% secure, but we work
              continuously to protect your data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">
              8. Changes to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we
              make material changes, we will update the "Last updated" date
              above and, where appropriate, notify you inside the App.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">9. Contact us</h2>
            <p>
              Questions about this policy or your data? Email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/" className="text-primary hover:underline">
            ← Back to Spesa Smart
          </Link>
        </footer>
      </div>
    </main>
  );
}
