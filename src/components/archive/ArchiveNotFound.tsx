import Link from "next/link";

export default function ArchiveNotFound() {
  return (
    <div className="screen text-center">
      <h1 className="font-serif font-bold text-[28px] text-ink mb-4">
        Story Not Found
      </h1>
      <p className="font-body italic text-[17px] text-text-dim leading-[1.5]">
        This room&apos;s stories don&apos;t exist yet &mdash; or never got
        written.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block font-body italic text-[15px] text-text-muted hover:text-ink transition-colors"
      >
        Start your own game &rarr;
      </Link>
    </div>
  );
}
