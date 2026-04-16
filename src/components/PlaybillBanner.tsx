// Persistent masthead shown at the top of every page. The yellow Playbill
// banner is part of the shared layout, not per-screen.
// Title is a pre-rendered PNG to avoid font-loading flash (FOUT).
export default function PlaybillBanner() {
  return (
    <div className="banner">
      <img
        src="/plotline-title.png"
        alt="Plotline"
        className="banner-title-img"
        width={355}
        height={44}
        draggable={false}
      />
      <div className="banner-subtitle">The Collaborative Storytelling Game</div>
    </div>
  );
}
