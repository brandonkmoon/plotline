import Link from "next/link";

export default function ArchiveNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full text-center"
        style={{ maxWidth: 420 }}
      >
        <p
          className="font-display text-[28px] text-text-muted mb-8"
          style={{
            textShadow:
              "2px 2px 0 rgba(0,0,0,.85), 0 0 30px rgba(212,168,67,.1)",
          }}
        >
          Plotline
        </p>
        <p className="font-serif italic text-[20px] text-text-dim leading-relaxed">
          This room&apos;s stories don&apos;t exist yet &mdash; or never got
          written.
        </p>
        <Link
          href="/"
          className="mt-8 font-sans text-[14px] text-gold hover:text-gold-light transition-colors"
        >
          Start your own game &rarr;
        </Link>
      </div>
    </div>
  );
}
