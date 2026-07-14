import Link from "next/link";

export default function NotFound() {
  return (
    <div className="screen text-center">
      <hr className="rule" />
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
        Intermission
      </p>
      <h1 className="font-serif font-bold text-[48px] text-ink mb-1">404</h1>
      <p className="font-body italic text-[16px] text-text-dim mb-8">
        This page isn&rsquo;t in the program.
      </p>
      <Link
        href="/"
        className="inline-block font-serif font-medium text-[16px] uppercase bg-ink text-white py-4 px-6 hover:bg-[#333] transition-colors"
        style={{ letterSpacing: "3px", borderRadius: 0 }}
      >
        Back to Home
      </Link>
    </div>
  );
}
