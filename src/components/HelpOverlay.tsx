"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useFocusTrap } from "@/lib/client/useFocusTrap";
import { getHelpScreen, onHelpScreenChange, HELP_TIPS } from "@/lib/helpContext";

function useHelpScreen() {
  return useSyncExternalStore(
    onHelpScreenChange,
    getHelpScreen,
    () => null
  );
}

export default function HelpOverlay() {
  const [showTip, setShowTip] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const screen = useHelpScreen();
  const tip = screen ? HELP_TIPS[screen] : null;

  const handleToggle = useCallback(() => {
    if (showFull) {
      setShowFull(false);
    } else if (showTip) {
      setShowTip(false);
    } else if (tip) {
      setShowTip(true);
    } else {
      setShowFull(true);
    }
  }, [showTip, showFull, tip]);

  const fullPanelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(fullPanelRef, showFull, () => setShowFull(false));

  // Close on Escape
  useEffect(() => {
    if (!showTip && !showFull) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowTip(false); setShowFull(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showTip, showFull]);

  // Prevent body scroll when full overlay is open
  useEffect(() => {
    document.body.style.overflow = showFull ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showFull]);

  // Auto-dismiss tip when screen changes
  useEffect(() => {
    setShowTip(false);
  }, [screen]);

  return (
    <>
      {/* Floating ? button */}
      <button
        onClick={handleToggle}
        aria-label="How to play"
        className="help-btn"
        type="button"
      >
        ?
      </button>

      {/* Context-sensitive tip */}
      {showTip && tip && (
        <div
          className="fixed bottom-16 right-4 z-[60] max-w-[320px] bg-ink text-white px-4 py-3 cursor-pointer"
          style={{ animation: "helpSlideUp 0.2s ease-out" }}
          onClick={() => setShowTip(false)}
        >
          <p className="font-body text-[14px] leading-[1.5]">{tip}</p>
          <button
            onClick={(e) => { e.stopPropagation(); setShowTip(false); setShowFull(true); }}
            className="font-sans text-[10px] uppercase tracking-[2px] text-white/60 hover:text-white mt-2 block transition-colors"
          >
            Full Program &rarr;
          </button>
        </div>
      )}

      {/* Full program overlay */}
      {showFull && (
        <div className="help-backdrop" onClick={() => setShowFull(false)}>
          <div
            ref={fullPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="How to play"
            tabIndex={-1}
            className="help-panel outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowFull(false)}
              className="help-close"
              aria-label="Close"
              type="button"
            >
              &times;
            </button>

            <h2 className="font-serif font-bold text-[22px] text-ink text-center uppercase tracking-[3px] mb-6">
              The Program
            </h2>

            {/* The Game */}
            <p className="help-group-label">The Game</p>

            <div className="help-section">
              <h3 className="help-q">The Premise</h3>
              <p className="help-a">
                Everyone answers 7 prompts without seeing what anyone else
                wrote. Your answers get woven into scenes about real people
                in the room. Then someone reads each scene aloud.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">The 7 Acts</h3>
              <div className="help-acts">
                <div className="help-act"><span className="help-act-num">1</span> Pick someone &mdash; give them a persona</div>
                <div className="help-act"><span className="help-act-num">2</span> Pick someone else &mdash; same thing</div>
                <div className="help-act"><span className="help-act-num">3</span> Where are they?</div>
                <div className="help-act"><span className="help-act-num">4</span> What are they doing?</div>
                <div className="help-act"><span className="help-act-num">5</span> What does the first character say?</div>
                <div className="help-act"><span className="help-act-num">6</span> What does the second character say?</div>
                <div className="help-act"><span className="help-act-num">7</span> How does it end?</div>
              </div>
            </div>

            <div className="help-section">
              <h3 className="help-q">Tips</h3>
              <p className="help-a">
                Write something dumb. Seriously. The dumber the better.
                Keep it short &mdash; one line is perfect. Present tense.
              </p>
            </div>

            {/* The Reveal */}
            <p className="help-group-label">The Reveal</p>

            <div className="help-section">
              <h3 className="help-q">How Reading Works</h3>
              <p className="help-a">
                One player reads each scene aloud &mdash; whoever wrote the
                ending. They tap to reveal lines one at a time. Everyone
                else sees the lines appear on their screen.
              </p>
            </div>

            {/* Competitive */}
            <p className="help-group-label">Competitive Mode</p>

            <div className="help-section">
              <h3 className="help-q">Voting</h3>
              <p className="help-a">
                After each scene is read, vote for the best line.
              </p>
              <ul className="help-a mt-2 space-y-1 list-none">
                <li>&bull; Tap = 1 pt to the author</li>
                <li>&bull; Long-press = standing ovation (3 pts to author, 2 to you)</li>
                <li>&bull; 1 standing ovation per game</li>
                <li>&bull; Don&rsquo;t vote? Assigned randomly</li>
                <li>&bull; Final game = double points</li>
              </ul>
            </div>

            <div className="help-section">
              <h3 className="help-q">Awards</h3>
              <p className="help-a">
                After the final game: Casting Director, Scene Stealer,
                Speechwriter, Closer, Fan Favorite, Popularity,
                and Line of the Series.
              </p>
            </div>

            {/* Troubleshooting */}
            <p className="help-group-label">Troubleshooting</p>

            <div className="help-section">
              <h3 className="help-q">Disconnected?</h3>
              <p className="help-a">
                Reopen the room link or rejoin with the same name.
                You&apos;ll pick up where you left off.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">Joined Late?</h3>
              <p className="help-a">
                You&apos;ll spectate the current game. Tap &ldquo;Ready
                to Join&rdquo; to play the next one.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">Timer Ran Out?</h3>
              <p className="help-a">
                The host can advance. A placeholder fills in for you.
                The show must go on.
              </p>
            </div>

            {/* About */}
            <p className="help-group-label">About the Show</p>

            <div className="help-section">
              <p className="help-a">
                Plotline is a modern take on <em>Consequences</em>, a parlor
                game from Victorian England. The original version was played
                with folded paper &mdash; each player wrote a line, folded
                the paper to hide it, and passed it along. When unfolded,
                the result was a story nobody intended to write.
              </p>
              <p className="help-a mt-3">
                The game spread through drawing rooms and dinner parties
                across Europe. The Surrealists adopted it in the 1920s
                as <em>Cadavre Exquis</em> (Exquisite Corpse), using it
                to create poetry and art. Andr&eacute; Breton, Yves Tanguy,
                and Marcel Duchamp all played.
              </p>
              <p className="help-a mt-3">
                Plotline brings the same idea to your phone &mdash; no
                paper, no folding, same chaos.
              </p>
              <p className="help-a mt-3 font-sans text-[11px] uppercase tracking-[2px] text-text-muted">
                Created by Brandon Moon
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
