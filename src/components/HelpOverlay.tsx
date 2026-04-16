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
                Everyone answers 7 prompts. You can&apos;t see what anyone else
                wrote. Your answers get shuffled together into stories about
                people in the room. Then someone reads each story out loud.
                Chaos ensues.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What do I do?</h3>
              <p className="help-a">
                Each round, you&apos;ll see a prompt. Type an answer and hit
                Submit before the timer runs out. If you don&apos;t submit in
                time, the host can advance and a placeholder will fill in
                for you.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What are the 7 acts?</h3>
              <div className="help-acts">
                <div className="help-act"><span className="help-act-num">1</span> Pick someone &mdash; give them a persona</div>
                <div className="help-act"><span className="help-act-num">2</span> Pick someone else &mdash; same thing</div>
                <div className="help-act"><span className="help-act-num">3</span> Where are they?</div>
                <div className="help-act"><span className="help-act-num">4</span> What are they doing?</div>
                <div className="help-act"><span className="help-act-num">5</span> What does the first one say?</div>
                <div className="help-act"><span className="help-act-num">6</span> What does the other say back?</div>
                <div className="help-act"><span className="help-act-num">7</span> How does it end?</div>
              </div>
            </div>

            <div className="help-section">
              <h3 className="help-q">Wait, who am I writing about?</h3>
              <p className="help-a">
                In Acts 1 and 2, you&apos;ll pick real people in the room by
                tapping their name. Then you add a funny description. The rest
                of the story is about those two characters.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">Can other people see what I write?</h3>
              <p className="help-a">
                Not until the story is read aloud at the end. Everything is
                blind until then.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">What if I can&apos;t think of anything?</h3>
              <p className="help-a">
                Write something dumb. Seriously. The dumber the better. Also
                the input field has example text &mdash; you can riff off that.
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

            <div className="help-section">
              <h3 className="help-q">How does the reading part work?</h3>
              <p className="help-a">
                One player is the designated reader for each story. They see
                the lines one at a time and read them aloud to the group.
                Everyone else just watches. When all the stories are done,
                the game ends.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">I got disconnected</h3>
              <p className="help-a">
                Reopen the room link or go back through Join and enter the
                same name. You&apos;ll pick up where you left off.
              </p>
            </div>

            <div className="help-section">
              <h3 className="help-q">How many people do we need?</h3>
              <p className="help-a">
                4 minimum, 12 maximum. More people = more stories = more
                chaos.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
