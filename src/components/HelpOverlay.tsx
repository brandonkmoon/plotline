"use client";

import { useState, useCallback, useEffect } from "react";

export default function HelpOverlay() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Floating ? button — always visible */}
      <button
        onClick={toggle}
        aria-label="How to play"
        className="help-btn"
        type="button"
      >
        ?
      </button>

      {/* Overlay */}
      {open && (
        <div className="help-backdrop" onClick={toggle}>
          <div
            className="help-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={toggle}
              className="help-close"
              aria-label="Close"
              type="button"
            >
              &times;
            </button>

            <h2 className="font-serif font-bold text-[22px] text-ink text-center uppercase tracking-[3px] mb-6">
              How to Play
            </h2>

            <div className="help-section">
              <h3 className="help-q">What is this game?</h3>
              <p className="help-a">
                Everyone answers 7 prompts without seeing what anyone else
                wrote. Your answers get woven together into stories about
                real people in the room. Then someone reads each story aloud.
                Chaos ensues. You need 4&ndash;12 players.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What do I do?</h3>
              <p className="help-a">
                Each act, you&apos;ll see a prompt. Answer it and hit Submit
                before the timer runs out. If you miss the timer, the host
                can advance and a placeholder fills in for you.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What are the 7 acts?</h3>
              <div className="help-acts">
                <div className="help-act"><span className="help-act-num">1</span> Pick someone &mdash; give them a persona</div>
                <div className="help-act"><span className="help-act-num">2</span> Pick someone else &mdash; same thing</div>
                <div className="help-act"><span className="help-act-num">3</span> Where are they?</div>
                <div className="help-act"><span className="help-act-num">4</span> What are they doing?</div>
                <div className="help-act"><span className="help-act-num">5</span> What does the first character say?</div>
                <div className="help-act"><span className="help-act-num">6</span> What does the second character say in reply?</div>
                <div className="help-act"><span className="help-act-num">7</span> How does it end?</div>
              </div>
            </div>

            <div className="help-section">
              <h3 className="help-q">Wait, who am I writing about?</h3>
              <p className="help-a">
                In Acts 1 and 2 you&apos;ll tap a real person in the room and
                give them a funny description. The rest of the story is about
                those two. In the dialogue acts you won&apos;t know their
                names &mdash; that&apos;s intentional. Just write the line;
                it&apos;ll make sense at the reveal.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What if I can&apos;t think of anything?</h3>
              <p className="help-a">
                Write something dumb. Seriously. The dumber the better. The
                input field has an example &mdash; you can riff off that.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">My screen says &ldquo;Waiting&rdquo;</h3>
              <p className="help-a">
                You already submitted. Sit tight while everyone else finishes
                or the timer runs out.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">The timer ran out and I didn&apos;t submit</h3>
              <p className="help-a">
                The host can advance the round. A random placeholder fills in
                for you. It won&apos;t be as funny as what you would have
                written, but the show must go on.
              </p>
            </div>

            <p className="help-group-label">The Reveal</p>

            <div className="help-section">
              <h3 className="help-q">How does the reading part work?</h3>
              <p className="help-a">
                One player reads each story aloud &mdash; whoever wrote the
                ending for that one. They tap to reveal the lines one at a
                time. Everyone else sees the lines appear on their screen as
                they&apos;re read. When all stories are done, the game ends.
              </p>
            </div>

            <p className="help-group-label">Joining Late</p>

            <div className="help-section">
              <h3 className="help-q">I joined while the game was already going</h3>
              <p className="help-a">
                You&apos;re in spectator mode. You can watch the current game
                unfold &mdash; the timer, submissions, and reveal all show on
                your screen. Tap &ldquo;Join Next Game&rdquo; to confirm
                you&apos;re in for the next round, and you&apos;ll be added
                automatically when it starts.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What can I see as a spectator?</h3>
              <p className="help-a">
                During the writing phase you&apos;ll see the countdown and
                who&apos;s submitted. During the reveal you&apos;ll see the
                stories as they&apos;re read aloud. You just can&apos;t
                submit answers for the current game.
              </p>
            </div>

            <p className="help-group-label">Connection Issues</p>

            <div className="help-section">
              <h3 className="help-q">I got disconnected</h3>
              <p className="help-a">
                Reopen the room link or go back to Join and enter the same
                name &mdash; you&apos;ll pick up where you left off. If you
                see &ldquo;Room unavailable,&rdquo; that doesn&apos;t mean
                the game is over. Try rejoining with the same name. The game
                doesn&apos;t pause when someone drops.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">I&apos;m the host and someone disconnected</h3>
              <p className="help-a">
                Once everyone else has submitted, an Advance button appears.
                Use it to keep the game moving. If you disconnect, hosting
                transfers automatically to another player &mdash; they&apos;ll
                see a banner letting them know.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">The reader disconnected during the reveal</h3>
              <p className="help-a">
                The host automatically takes over reading for that story.
                No action needed &mdash; the host&apos;s screen will update
                to show the lines.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">Competitive Mode</h3>
              <p className="help-a">
                The host picks Competitive when starting the game. After each
                story is read aloud, everyone votes for the best line.
              </p>
              <ul className="help-a mt-2 space-y-1 list-none">
                <li>&bull; Tap a line = 1 point to the author</li>
                <li>&bull; Long-press for a standing ovation = 3 pts to author + 2 pts to you</li>
                <li>&bull; 1 standing ovation per game &mdash; use it or lose it</li>
                <li>&bull; Don&rsquo;t vote in time? Your vote is assigned randomly</li>
                <li>&bull; Final game of the series = double points</li>
              </ul>
              <p className="help-a mt-2">
                Awards at the end: Casting Director, Scene Stealer,
                Speechwriter, Closer, Fan Favorite, Popularity, Line of the Series.
              </p>
            </div>

            <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted text-center mt-6">
              Built by Brandon Moon
            </p>
          </div>
        </div>
      )}
    </>
  );
}
