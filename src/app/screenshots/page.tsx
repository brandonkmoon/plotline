"use client";

import { useState } from "react";

const MOCK_PLAYERS = [
  { id: "p1", name: "Brandon", isHost: true, isConnected: true, joinedAt: 1 },
  { id: "p2", name: "Sarah", isHost: false, isConnected: true, joinedAt: 2 },
  { id: "p3", name: "Marcus", isHost: false, isConnected: true, joinedAt: 3 },
  { id: "p4", name: "Dani", isHost: false, isConnected: true, joinedAt: 4 },
  { id: "p5", name: "Rachel", isHost: false, isConnected: true, joinedAt: 5 },
];

const MOCK_STATUSES: Record<string, string> = {
  p1: "submitted", p2: "submitted", p3: "writing", p4: "submitted", p5: "idle",
};

const MOCK_SECTIONS = [
  { text: "Brenda — a woman who irons her socks", style: "name" as const },
  { text: "and Gary — a semi-professional kazoo player who is between gigs", style: "name" as const },
  { text: "are in a hospital waiting room that smells like a Subway restaurant,", style: "location" as const },
  { text: "teaching a pigeon to sit.", style: "action" as const },
  { text: 'Brenda says, "I didn\u2019t come here to make friends, and yet."', style: "dialogue" as const, speakerName: "Brenda" },
  { text: 'Gary says, "The thing about geese is you can\u2019t reason with them."', style: "dialogue" as const, speakerName: "Gary" },
  { text: "Then, the vending machine gave everyone their money back, which felt like a sign, but wasn\u2019t.", style: "ending" as const },
];

const MOCK_STORIES = [
  {
    storyIndex: 0,
    title: "Brenda and Gary at the Hospital",
    sections: MOCK_SECTIONS,
    readerName: "Rachel",
    responses: MOCK_SECTIONS.map(s => s.text),
    prompts: ["Act 1", "Act 2", "Act 3", "Act 4", "Act 5", "Act 6", "Act 7"],
  },
];

const SCREENS = [
  "title",
  "below-fold",
  "lobby",
  "prompt-name",
  "prompt-text",
  "waiting",
  "reveal",
  "voting",
  "end-classic",
  "end-competitive",
  "awards",
] as const;

type Screen = typeof SCREENS[number];

// Mobile Producer chevron banner — SVG mock matching the native ProducerBanner
// (5 peaks / 4 valleys on the right edge, 5pt tooth depth, half-tooth corners,
// crisp drop shadow at +2/+3 with 25% black).
function ChevronBanner() {
  const VISIBLE_WIDTH = 224;
  const HIDDEN_LEFT = 40;
  const TOTAL_WIDTH = VISIBLE_WIDTH + HIDDEN_LEFT;
  const HEIGHT = 74;
  const TOOTH_DEPTH = 5;
  const PEAKS = 5;
  const SEGMENTS = (PEAKS - 1) * 2;
  const SHADOW_DX = 2;
  const SHADOW_DY = 3;
  const segH = HEIGHT / SEGMENTS;

  const parts: string[] = [];
  parts.push(`M 0 0`);
  parts.push(`L ${TOTAL_WIDTH} 0`);
  for (let i = 1; i < SEGMENTS; i++) {
    const y = (i * segH).toFixed(2);
    const x = i % 2 === 1 ? TOTAL_WIDTH - TOOTH_DEPTH : TOTAL_WIDTH;
    parts.push(`L ${x} ${y}`);
  }
  parts.push(`L ${TOTAL_WIDTH} ${HEIGHT}`);
  parts.push(`L 0 ${HEIGHT} Z`);
  const d = parts.join(" ");

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        bottom: 32,
        width: VISIBLE_WIDTH,
        height: HEIGHT,
        zIndex: 40,
      }}
    >
      <div style={{ marginLeft: -HIDDEN_LEFT }}>
        <svg width={TOTAL_WIDTH + SHADOW_DX + 2} height={HEIGHT + SHADOW_DY + 3}>
          <path d={d} fill="rgba(0,0,0,0.25)" transform={`translate(${SHADOW_DX} ${SHADOW_DY})`} />
          <path d={d} fill="#1a1a1a" />
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          height: HEIGHT,
          left: 16,
          justifyContent: "center",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-playfair), serif",
            fontWeight: 700,
            fontSize: 15,
            color: "#fceb00",
          }}
        >
          ★
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 20,
          right: 20,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: 20,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-playfair), serif",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#ffffff",
          }}
        >
          Want a Winner?
        </span>
        <span
          style={{
            fontFamily: "var(--font-lora), serif",
            fontStyle: "italic",
            fontSize: 14,
            marginTop: 4,
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          Become a Producer!
        </span>
      </div>
    </div>
  );
}

// Help FAB mock — black-bordered "?" square in bottom-right, aligned with banner center
function HelpFab() {
  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 49,
        width: 40,
        height: 40,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: "#1a1a1a",
        backgroundColor: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-playfair), serif",
          fontWeight: 700,
          fontSize: 20,
          color: "#1a1a1a",
          lineHeight: "22px",
        }}
      >
        ?
      </span>
    </div>
  );
}

function MockTitle() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "calc(100vh - 100px)",
        display: "flex",
        flexDirection: "column",
        paddingLeft: 20,
        paddingRight: 20,
      }}
    >
      <div style={{ flex: 1 }} />

      <div className="screen" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <button
          className="w-full font-serif font-medium uppercase text-[16px] py-4 px-6 bg-ink text-white"
          style={{ letterSpacing: "3px" }}
        >
          Create a Show
        </button>
        <div style={{ height: 12 }} />
        <button
          className="w-full font-serif font-medium uppercase text-[14px] py-3 px-6 border-2 border-ink text-ink bg-transparent"
          style={{ letterSpacing: "2px" }}
        >
          Join a Show
        </button>
        <p
          className="font-sans text-[11px] uppercase text-text-muted text-center"
          style={{ letterSpacing: "3px", marginTop: 40 }}
        >
          4 &ndash; 10 Players
        </p>
      </div>

      <div style={{ flex: 1 }} />

      {/* Down arrow at the very bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 4,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 40,
        }}
      >
        <span
          style={{
            fontSize: 22,
            color: "#777777",
            lineHeight: "24px",
          }}
        >
          ↓
        </span>
      </div>

      <ChevronBanner />
      <HelpFab />
    </div>
  );
}

function MockBelowFold() {
  return (
    <div className="screen" style={{ paddingTop: 32 }}>
      <p
        className="font-sans text-[10px] uppercase tracking-[3px] text-text-muted text-center mb-6"
      >
        A scene from last night.
      </p>

      <div className="border-t border-b border-ink py-6 space-y-3">
        <p className="font-serif font-bold text-[22px] text-ink leading-tight mb-6 text-center">
          &ldquo;Brenda and Gary at the Hospital&rdquo;
        </p>

        {[
          { line: "Brenda — a woman who irons her socks", by: "Rachel" },
          { line: "and Gary — a semi-professional kazoo player who is between gigs", by: "Tom" },
          { line: "are in a hospital waiting room that smells like a Subway restaurant,", by: "Brenda" },
          { line: "teaching a pigeon to sit.", by: "Gary" },
          { line: "Brenda says, “I didn’t come here to make friends, and yet.”", by: "Nadia" },
          { line: "Gary says, “The thing about geese is you can’t reason with them.”", by: "Phil" },
          { line: "Then, the vending machine gave everyone their money back, which felt like a sign, but wasn’t.", by: "Carmen" },
        ].map(({ line, by }) => (
          <div key={by}>
            <p className="font-body text-[16px] text-ink leading-[1.6]">{line}</p>
            <p className="font-sans text-[11px] text-text-muted tracking-[1px] mt-0.5">
              &mdash; written by {by}
            </p>
          </div>
        ))}
      </div>

      <p className="font-sans text-[12px] uppercase tracking-[2px] text-ink text-center my-8">
        Different writers. Zero coordination.
      </p>

      <hr className="rule" />

      <p className="font-serif font-bold text-[20px] text-ink mt-8 mb-3">Want a winner?</p>
      <p className="font-body text-[15px] text-ink leading-relaxed mb-3">
        <span style={{ textDecoration: "underline" }}>Upgrade to Producer</span> and unlock
        Competitive Mode &mdash; vote on the best lines, deploy your one standing ovation per
        game for something truly exceptional, and play a series with cumulative standings and
        a full awards ceremony.
      </p>
      <p className="font-body italic text-[15px] text-text-dim mb-4">
        Every great show needs a producer.
      </p>
      <p
        className="font-sans text-[12px] uppercase text-ink"
        style={{ letterSpacing: "2px", textDecoration: "underline", marginBottom: 32 }}
      >
        Tap to Upgrade →
      </p>

      <hr className="rule" />

      <p className="font-serif font-bold text-[22px] text-ink text-center leading-snug my-12">
        Your group has a scene like this.
        <br />
        You just haven&rsquo;t written it yet.
      </p>

      <hr className="rule" />

      <p className="font-sans text-[11px] text-text-muted text-center tracking-[1px] my-8">
        Privacy
        <span className="mx-2 opacity-40">|</span>
        Created by Brandon Moon
      </p>
    </div>
  );
}

function MockLobby() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-6">
        <p className="font-body text-[13px] uppercase tracking-[2px] text-text-dim mb-2">Room Code</p>
        <p className="font-serif font-bold text-ink" style={{ fontSize: "clamp(32px, 12vw, 48px)", letterSpacing: "clamp(4px, 3vw, 10px)" }}>
          KXMR
        </p>
      </div>
      <hr className="rule" />
      <p className="font-body italic text-[14px] text-text-muted text-center mb-6">
        Share the room code to invite more players
      </p>
      <button className="w-full font-serif font-medium uppercase cursor-pointer text-[16px] py-4 px-6 bg-ink text-white" style={{ letterSpacing: "3px" }}>
        Start the Show
      </button>
      <hr className="rule" />
      <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mb-4">Cast</p>
      <ul className="w-full list-none">
        {MOCK_PLAYERS.map((p) => (
          <li key={p.id} className="font-body text-[15px] py-[10px] flex justify-between items-center border-b border-list-border last:border-b-0">
            <span>{p.name}</span>
            {p.isHost && <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-none">Host</span>}
          </li>
        ))}
      </ul>
      <p className="font-sans text-[13px] text-text-muted text-center mt-2">5/10 players</p>
    </div>
  );
}

function MockPromptName() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-2">
        <p className="font-sans text-[11px] uppercase tracking-[3px] text-text-muted mb-1">Act 1 of 7</p>
        <p className="font-body text-[24px] text-ink text-center leading-[1.5]">
          Pick someone in this room. Who are they really?
        </p>
      </div>
      <hr className="rule" />
      <p className="font-body italic text-[14px] text-text-muted text-center mb-3">
        Tap a name to cast them, then write a short character description.
      </p>
      <p className="font-sans text-[13px] text-text-muted text-center mb-5">
        <span style={{ fontStyle: "italic" }}>Name &mdash; a brief, funny description</span>
      </p>
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {["Sarah", "Marcus", "Dani", "Rachel"].map((name, i) => (
          <button
            key={name}
            className={`px-4 py-2 border-2 font-body text-[15px] transition-colors ${
              i === 1 ? "border-ink bg-ink text-white" : "border-ink text-ink"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <input
        type="text"
        value="a retired sword swallower with trust issues"
        readOnly
        className="w-full font-body text-[16px] text-ink py-[12px] px-4 border-2 border-ink"
        style={{ borderRadius: 0 }}
      />
      <div className="mt-6">
        <button className="w-full font-serif font-medium uppercase text-[16px] py-4 px-6 bg-ink text-white" style={{ letterSpacing: "3px" }}>
          Lock It In
        </button>
      </div>
    </div>
  );
}

function MockPromptText() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-2">
        <p className="font-sans text-[11px] uppercase tracking-[3px] text-text-muted mb-1">Act 3 of 7</p>
        <p className="font-body text-[24px] text-ink text-center leading-[1.5]">
          Where are they?
        </p>
      </div>
      <hr className="rule" />
      <textarea
        value="in a hospital waiting room that smells like a Subway restaurant"
        readOnly
        className="w-full font-body text-[18px] text-ink py-[14px] px-4 border-2 border-ink resize-none"
        style={{ borderRadius: 0, minHeight: 100 }}
      />
      <p className="font-sans text-[12px] text-text-muted text-right mt-1">64/120</p>
      <div className="mt-6">
        <button className="w-full font-serif font-medium uppercase text-[16px] py-4 px-6 bg-ink text-white" style={{ letterSpacing: "3px" }}>
          Lock It In
        </button>
      </div>
    </div>
  );
}

function MockWaiting() {
  return (
    <div className="screen anim-fade-in text-center">
      <hr className="rule" />
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">Between Acts</p>
      <h1 className="font-serif font-bold text-[24px] text-ink mb-1">Sit Tight</h1>
      <p className="font-sans text-[12px] text-text-muted mb-1">3 of 5 submitted</p>
      <div className="flex justify-center gap-1.5 mb-4">
        {[true, true, true, false, false].map((done, i) => (
          <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: done ? "#1a1a1a" : "#d0d0d0" }} />
        ))}
      </div>
      <hr className="rule" />
      <ul className="w-full list-none mt-4">
        {MOCK_PLAYERS.map((p) => (
          <li key={p.id} className="font-body text-[15px] py-[10px] flex justify-between items-center border-b border-list-border last:border-b-0">
            <span>{p.name}</span>
            <span className={`font-sans text-[14px] ${MOCK_STATUSES[p.id] === "submitted" ? "text-ink" : "text-text-muted"}`}>
              {MOCK_STATUSES[p.id] === "submitted" ? "\u2713" : "\u22EF"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MockReveal() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-2">
        <p className="font-sans text-[11px] uppercase tracking-[3px] text-text-muted mb-1">Now Playing</p>
        <h1 className="font-serif font-bold text-[24px] text-ink text-center mb-1">Scene 1 of 5</h1>
        <p className="font-serif font-bold text-[21px] text-ink text-center mb-1">
          &ldquo;Brenda and Gary at the Hospital&rdquo;
        </p>
        <p className="font-body italic text-[15px] text-text-dim">Read by Rachel</p>
      </div>
      <hr className="rule" />
      <div className="space-y-3">
        {MOCK_SECTIONS.slice(0, 5).map((section, i) => (
          <p key={i} className={`font-body text-[18px] leading-[1.7] ${section.style === "dialogue" ? "italic" : ""} text-ink`}>
            {section.text}
          </p>
        ))}
        <div className="relative overflow-hidden">
          <p className="font-body text-[18px] leading-[1.7] text-ink" style={{ filter: "blur(5px)", opacity: 0.5 }}>
            {MOCK_SECTIONS[5].text}
          </p>
        </div>
      </div>
    </div>
  );
}

function MockVoting() {
  return (
    <div className="screen anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
        Vote for the Best Line
      </p>
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="font-sans text-[11px] text-text-muted">&#9733; 1 standing ovation</span>
        <span className="font-sans text-[11px] text-text-muted">2/5 voted</span>
      </div>
      <div className="flex justify-center gap-1.5 mb-4">
        {[true, true, false, false, false].map((done, i) => (
          <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: done ? "#1a1a1a" : "#d0d0d0" }} />
        ))}
      </div>
      <hr className="rule" style={{ marginTop: 0 }} />
      <div className="space-y-3">
        {MOCK_SECTIONS.map((section, i) => (
          <div
            key={i}
            className={`w-full text-left p-4 border-2 transition-all ${
              i === 4 ? "border-ink bg-ink/5 shadow-sm scale-[1.01]" : "border-list-border"
            }`}
          >
            <p className={`font-body text-[17px] leading-[1.6] ${section.style === "dialogue" ? "italic" : ""} text-ink`}>
              {section.text}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <button className="w-full font-serif font-medium uppercase text-[16px] py-4 px-6 bg-ink text-white" style={{ letterSpacing: "3px" }}>
          Submit Vote
        </button>
      </div>
    </div>
  );
}

const ALL_SCENE_CARDS = [
  { title: "Brenda and Gary at the Hospital", expanded: true },
  { title: "Dave and Rachel at the Moon Base", expanded: false },
  { title: "Captain Socks and Nadia at IKEA", expanded: false },
  { title: "Phil and Sarah at the DMV", expanded: false },
  { title: "Marcus and Dani on a Train", expanded: false },
];

function SceneCards({ showPoints }: { showPoints?: boolean }) {
  return (
    <>
      {ALL_SCENE_CARDS.map((card, i) => (
        <div key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>
          <div className="w-full text-left px-4 py-3 flex items-center justify-between border border-ink" style={{ background: "var(--banner)" }}>
            <div className="flex flex-col pr-4">
              <span className="font-sans text-[10px] uppercase tracking-[2px] mb-0.5" style={{ color: "rgba(26,26,26,0.5)" }}>Scene {i + 1} of 5</span>
              <span className="font-serif font-bold text-[15px] text-ink leading-snug">{card.title}</span>
            </div>
            <span className="font-sans text-[16px] text-ink">{card.expanded ? "↑" : "↓"}</span>
          </div>
          {card.expanded && (
            <div className="border border-t-0 border-ink bg-white px-4 pb-5 pt-4">
              {MOCK_SECTIONS.map((section, si) => {
                const authors = ["Rachel", "Tom", "Brenda", "Gary", "Nadia", "Phil", "Carmen"];
                const pts = showPoints ? [0, 0, 1, 0, 4, 2, 1][si] : 0;
                return (
                  <div key={si} className="mb-3 flex gap-3 items-start">
                    <div className="flex-1">
                      <p className={`font-body text-[17px] leading-[1.6] ${section.style === "dialogue" ? "italic" : ""} text-ink`}>
                        {section.text}
                      </p>
                      <p className="font-sans text-[11px] text-text-muted mt-0.5">&mdash; {authors[si]}</p>
                    </div>
                    {showPoints && pts > 0 && (
                      <span className="font-sans text-[11px] font-semibold text-ink bg-banner px-2 py-0.5 shrink-0 mt-1">
                        {pts} pt{pts !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                );
              })}
              <hr className="border-t border-ink/20 mb-4 mt-2" />
              <div className="flex items-center justify-between">
                <span className="font-sans text-[12px] uppercase tracking-[2px] text-ink">Share Scene ↗</span>
                <span className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim">Share Image ↗</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function MockEndClassic() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-1">
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">The End</p>
        <h1 className="font-serif font-bold text-[28px] text-ink mb-1">That&rsquo;s a Wrap</h1>
        <p className="font-body italic text-[14px] text-text-dim">5 scenes &middot; 5 players</p>
      </div>
      <hr className="rule" />
      <SceneCards />
      <hr className="rule" />
      <button className="w-full font-serif font-medium uppercase text-[14px] py-3 px-6 bg-transparent text-ink border-2 border-ink" style={{ letterSpacing: "2px" }}>
        Play Again
      </button>
    </div>
  );
}

function MockEndCompetitive() {
  const standings = [
    { name: "Brandon", pts: 18 },
    { name: "Sarah", pts: 14 },
    { name: "Rachel", pts: 12 },
    { name: "Marcus", pts: 9 },
    { name: "Dani", pts: 7 },
  ];

  return (
    <div className="screen anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-1">Intermission</p>
      <p className="font-body italic text-[14px] text-text-dim text-center mb-1">The scores so far.</p>
      <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted text-center mb-4">Game 1 of 3</p>

      <div className="text-center border-2 border-ink py-3 px-4 mb-2">
        <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Top Performer</p>
        <p className="font-serif font-bold text-[22px] text-ink">Brandon</p>
        <p className="font-sans text-[12px] text-text-dim">+18 pts this game</p>
      </div>

      <hr className="rule" />
      <div className="border-l-2 border-l-banner pl-4 py-2 mb-2">
        <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Line of the Game</p>
        <p className="font-body italic text-[17px] text-ink leading-[1.5]">
          &ldquo;I didn&rsquo;t come here to make friends, and yet.&rdquo;
        </p>
        <p className="font-sans text-[12px] text-text-dim mt-1">&mdash; Nadia (4 pts)</p>
      </div>
      <hr className="rule" />

      {standings.map((p, i) => (
        <div key={p.name} className={`flex items-center justify-between py-3 border-b border-list-border last:border-b-0 ${i === 0 ? "bg-ink/5" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="font-serif font-bold text-[20px] text-ink w-8 text-center">{i + 1}</span>
            <span className="font-body text-[17px] text-ink">{p.name}</span>
          </div>
          <span className="font-serif font-bold text-[18px] text-ink">{p.pts}</span>
        </div>
      ))}

      <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mt-6 mb-4">Scenes</p>
      <SceneCards showPoints />
    </div>
  );
}

function MockAwards() {
  const awards = [
    { title: "Casting Director", name: "Sarah", detail: "12 pts on character intros" },
    { title: "Scene Stealer", name: "Marcus", detail: "8 pts on settings & actions" },
    { title: "Speechwriter", name: "Brandon", detail: "15 pts on dialogue" },
    { title: "Fan Favorite", name: "Dani", detail: "3 standing ovations received" },
  ];

  return (
    <div className="screen anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-1">The Final Curtain</p>
      <p className="font-body italic text-[14px] text-text-dim text-center mb-6">The votes are in.</p>

      <div className="text-center py-5 px-4 mb-4" style={{ background: "var(--banner)", border: "2px solid var(--ink)" }}>
        <p className="font-sans text-[11px] uppercase tracking-[3px] mb-2" style={{ color: "rgba(26,26,26,0.5)" }}>Winner</p>
        <h1 className="font-serif font-bold text-ink mb-1" style={{ fontSize: "clamp(28px, 8vw, 40px)" }}>&#9733; Brandon &#9733;</h1>
        <p className="font-serif font-bold text-[20px] text-ink">42 pts</p>
      </div>

      <div className="flex justify-center gap-8 mb-2">
        <div className="text-center">
          <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Runner-Up</p>
          <p className="font-serif font-bold text-[18px] text-ink">Sarah</p>
          <p className="font-sans text-[13px] text-text-dim">31 pts</p>
        </div>
        <div className="text-center">
          <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Third</p>
          <p className="font-serif font-bold text-[18px] text-ink">Rachel</p>
          <p className="font-sans text-[13px] text-text-dim">24 pts</p>
        </div>
      </div>

      <hr className="rule" />

      <div className="border-l-2 pl-4 py-3 mb-4" style={{ borderLeftColor: "var(--banner)" }}>
        <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Line of the Series</p>
        <p className="font-body italic text-[17px] text-ink leading-[1.5]">
          &ldquo;The thing about geese is you can&rsquo;t reason with them.&rdquo;
        </p>
        <p className="font-sans text-[12px] text-text-dim mt-1">&mdash; Phil</p>
      </div>

      {awards.map((award) => (
        <div key={award.title} className="border-2 border-ink p-5 text-center mb-4">
          <p className="font-serif font-medium text-[12px] uppercase tracking-[3px] mb-1" style={{ color: "#b8960c" }}>{award.title}</p>
          <p className="font-serif font-bold text-[24px] text-ink mb-1">{award.name}</p>
          <p className="font-body italic text-[12px] text-text-dim">{award.detail}</p>
        </div>
      ))}

      <p className="font-body italic text-[15px] text-text-dim text-center mt-4 mb-6">Take a bow, everyone.</p>
    </div>
  );
}

export default function ScreenshotPage() {
  const [active, setActive] = useState<Screen>("title");
  const [navHidden, setNavHidden] = useState(false);

  return (
    <div>
      {/* Hide the layout banner and help button on this page */}
      <style>{`.banner:not(.screenshot-banner), .help-btn { display: none !important; }`}</style>

      {navHidden ? (
        <button
          onClick={() => setNavHidden(false)}
          className="fixed top-2 right-2 z-50 px-3 py-1 text-[11px] uppercase tracking-[1px] border border-ink bg-white text-ink"
        >
          Show ▾
        </button>
      ) : (
        <>
          {/* Screen selector — single-line scrollable, won't appear in screenshots */}
          <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-ink p-2 flex gap-2 items-center">
            <div className="flex gap-2 overflow-x-auto flex-1">
              {SCREENS.map((s) => (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={`shrink-0 px-3 py-1 text-[11px] uppercase tracking-[1px] border whitespace-nowrap ${
                    active === s ? "bg-ink text-white border-ink" : "border-ink text-ink"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => setNavHidden(true)}
              className="shrink-0 px-3 py-1 text-[11px] uppercase tracking-[1px] border border-ink bg-banner text-ink"
            >
              Hide ▴
            </button>
          </div>

          {/* Spacer for fixed nav */}
          <div style={{ height: 52 }} />
        </>
      )}

      {/* Banner — rendered here so it's below the selector tabs */}
      <div className="banner screenshot-banner">
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

      {/* InfoStrip — shown on all screens except lobby/title/below-fold */}
      {active !== "lobby" && active !== "title" && active !== "below-fold" && (
        <div className="bg-ink py-[6px] px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#1a1a1a" }} />
            <span className="font-sans text-[11px] uppercase tracking-[2px] font-semibold text-white">
              Brandon
            </span>
          </div>
          {(active === "prompt-name" || active === "prompt-text" || active === "voting") && (
            <span className="font-sans text-[13px] font-semibold tracking-[1px] text-white">
              1:12
            </span>
          )}
          <span className="font-sans text-[11px] font-semibold tracking-[2px] text-white">
            KXMR ↗
          </span>
        </div>
      )}

      {/* Render active screen */}
      {active === "title" && <MockTitle />}
      {active === "below-fold" && <MockBelowFold />}
      {active === "lobby" && <MockLobby />}
      {active === "prompt-name" && <MockPromptName />}
      {active === "prompt-text" && <MockPromptText />}
      {active === "waiting" && <MockWaiting />}
      {active === "reveal" && <MockReveal />}
      {active === "voting" && <MockVoting />}
      {active === "end-classic" && <MockEndClassic />}
      {active === "end-competitive" && <MockEndCompetitive />}
      {active === "awards" && <MockAwards />}
    </div>
  );
}
