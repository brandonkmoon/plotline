import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col items-center min-h-screen px-6 py-16">
      <div className="flex flex-col w-full" style={{ maxWidth: 560 }}>
        <Link
          href="/"
          className="font-display text-[24px] text-text-muted mb-10"
          style={{
            textShadow:
              "2px 2px 0 rgba(0,0,0,.85), 0 0 30px rgba(212,168,67,.1)",
          }}
        >
          Plotline
        </Link>

        <h1 className="font-serif text-[32px] text-text mb-6">
          Privacy Policy
        </h1>

        <div className="space-y-6 font-serif text-[17px] leading-relaxed text-text-dim">
          <p>
            Plotline uses{" "}
            <a
              href="https://plausible.io/data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-gold-light transition-colors underline underline-offset-4"
            >
              Plausible Analytics
            </a>
            , a privacy-friendly analytics tool that collects no cookies, no
            personal data, and provides aggregate-only statistics. Your visit is
            not tracked across sites or used for advertising.
          </p>

          <p>
            When you play a game, the prompts and responses you write are stored
            so that your group can revisit the stories via an archive link. No
            account or personal information is required to play. Archive data is
            associated only with a random room code.
          </p>

          <p>
            We use Sentry for error monitoring. Error reports may include
            technical information about the error (browser, URL, stack trace) but
            are scrubbed of any user-written content before being sent.
          </p>

          <p>
            No data is sold to third parties. No data is used for advertising.
            No cross-site tracking is performed.
          </p>
        </div>

        <Link
          href="/"
          className="mt-12 font-serif italic text-[16px] text-text-muted hover:text-text-dim transition-colors"
        >
          &larr; Back to Plotline
        </Link>
      </div>
    </div>
  );
}
