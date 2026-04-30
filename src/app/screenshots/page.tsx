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
      <p className="font-sans text-[13px] text-text-muted text-center mt-2">5/8 players</p>
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

function MockEndClassic() {
  return (
    <div className="screen anim-fade-in">
      <div className="text-center mb-1">
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">The End</p>
        <h1 className="font-serif font-bold text-[28px] text-ink mb-1">That&rsquo;s a Wrap</h1>
        <p className="font-body italic text-[14px] text-text-dim">5 scenes &middot; 5 players</p>
      </div>
      <hr className="rule" />
      {MOCK_STORIES.map((story, i) => (
        <div key={i}>
          <button className="w-full text-left px-4 py-3 flex items-center justify-between border border-ink" style={{ background: "var(--banner)" }}>
            <div className="flex flex-col pr-4">
              <span className="font-sans text-[10px] uppercase tracking-[2px] mb-0.5" style={{ color: "rgba(26,26,26,0.5)" }}>Scene 1 of 5</span>
              <span className="font-serif font-bold text-[15px] text-ink leading-snug">{story.title}</span>
            </div>
            <span className="font-sans text-[16px] text-ink">↓</span>
          </button>
        </div>
      ))}
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
  const [active, setActive] = useState<Screen>("lobby");

  return (
    <div>
      {/* Hide the layout banner and help button on this page */}
      <style>{`.banner:not(.screenshot-banner), .help-btn { display: none !important; }`}</style>

      {/* Screen selector — won't appear in screenshots */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-ink p-2 flex flex-wrap gap-2 justify-center">
        {SCREENS.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`px-3 py-1 text-[11px] uppercase tracking-[1px] border ${
              active === s ? "bg-ink text-white border-ink" : "border-ink text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Spacer for fixed nav */}
      <div style={{ height: 52 }} />

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

      {/* InfoStrip — shown on all screens except lobby */}
      {active !== "lobby" && (
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
