import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="screen" style={{ maxWidth: 560 }}>
      <h1 className="font-serif font-bold text-[28px] text-ink mb-6">
        Privacy Policy
      </h1>

      <div className="space-y-5 font-body text-[16px] leading-[1.6] text-ink">
        <p>
          Plotline uses{" "}
          <a
            href="https://plausible.io/data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-text-dim transition-colors"
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
          No data is sold to third parties. No data is used for advertising. No
          cross-site tracking is performed.
        </p>
      </div>

      <Link
        href="/"
        className="mt-10 block font-body italic text-[15px] text-text-muted hover:text-ink transition-colors"
      >
        &larr; Back to Plotline
      </Link>
    </div>
  );
}
