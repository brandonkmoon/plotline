export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { getDb, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import {
  normalizeLocation,
  normalizeAction,
  normalizeDialogue,
  normalizeEnding,
  generateStoryTitle,
} from "@/lib/game/normalize";

const WIDTH = 1080;
const HEIGHT = 1080;
const YELLOW = "#fceb00";
const INK = "#1a1a1a";
const WHITE = "#ffffff";
const MUTED = "#666666";

function extractName(nameResponse: string): string {
  for (const sep of [" \u2014 ", " \u2013 ", " - "]) {
    const idx = nameResponse.indexOf(sep);
    if (idx !== -1) return nameResponse.slice(0, idx).trim();
  }
  return nameResponse.trim();
}

// Fonts are bundled alongside this route (src/app/api/og/fonts/) so we
// don't depend on fetching from Google at runtime — which fails on Vercel
// because the Googlebot UA trick doesn't reliably return font URLs.
const FONT_DIR = join(process.cwd(), "src/app/api/og/fonts");

async function loadBundledFont(filename: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(FONT_DIR, filename));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string; storyIndex: string } }
) {
  const code = params.code.toUpperCase();
  const storyIdx = parseInt(params.storyIndex, 10);

  if (isNaN(storyIdx)) {
    return new Response("Invalid story index", { status: 400 });
  }

  // Fetch the single requested story first. This is cheap and lets us
  // return 404 before the expensive font loading / image rendering below.
  let storyData: {
    title: string;
    lines: { text: string; style: "name" | "location" | "action" | "dialogue" | "ending"; points?: number }[];
  } | null = null;

  try {
    const db = await getDb();

    const stories = await db
      .select()
      .from(schema.archivedStories)
      .where(
        and(
          eq(schema.archivedStories.roomCode, code),
          eq(schema.archivedStories.storyIndex, storyIdx)
        )
      );

    const story = stories[0];
    if (story) {
      const prompts = await db
        .select()
        .from(schema.archivedPrompts)
        .where(eq(schema.archivedPrompts.storyId, story.id));

      const sorted = prompts.sort((a: { slot: number }, b: { slot: number }) => a.slot - b.slot);
      const contributions = sorted.map((p: { contribution: string }) => p.contribution);
      const linePoints = sorted.map((p: { points?: number | null }) => p.points ?? 0);

      if (contributions.length >= 7) {
        const p1Full = contributions[0];
        const p2Full = contributions[1];
        const p1Name = extractName(p1Full);
        const p2Name = extractName(p2Full);

        const location = normalizeLocation(contributions[2]);
        const action = normalizeAction(contributions[3]);
        const dialogue1 = normalizeDialogue(contributions[4]);
        const dialogue2 = normalizeDialogue(contributions[5]);
        const ending = normalizeEnding(contributions[6]);
        const title = generateStoryTitle(p1Name, p2Name, contributions[2]);

        storyData = {
          title,
          lines: [
            { text: p1Full, style: "name", points: linePoints[0] },
            { text: `and ${p2Full}`, style: "name", points: linePoints[1] },
            { text: `are ${location},`, style: "location", points: linePoints[2] },
            { text: `${action}.`, style: "action", points: linePoints[3] },
            { text: `${p1Name} says, \u201c${dialogue1}\u201d`, style: "dialogue", points: linePoints[4] },
            { text: `${p2Name} says, \u201c${dialogue2}\u201d`, style: "dialogue", points: linePoints[5] },
            { text: `Then, ${ending}.`, style: "ending", points: linePoints[6] },
          ],
        };
      }
    }
  } catch {
    // Fall through to error card
  }

  if (!storyData) {
    return new Response("Story not found", { status: 404 });
  }

  // Load bundled fonts only after we know the story exists.
  type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  type FontOption = { name: string; data: ArrayBuffer; weight: Weight; style: "normal" | "italic" };
  let fonts: FontOption[] = [];
  try {
    const [playfairBold, loraRegular, loraItalic] = await Promise.all([
      loadBundledFont("PlayfairDisplay-Bold.woff2"),
      loadBundledFont("Lora-Regular.woff2"),
      loadBundledFont("Lora-Italic.woff2"),
    ]);
    fonts = [
      { name: "Playfair", data: playfairBold, weight: 700, style: "normal" },
      { name: "Lora", data: loraRegular, weight: 400, style: "normal" },
      { name: "Lora", data: loraItalic, weight: 400, style: "italic" },
    ];
  } catch (err) {
    console.error("Failed to load bundled fonts:", err);
    return new Response("Font loading failed", { status: 500 });
  }

  const { title, lines } = storyData;
  const headingFont = fonts.length > 0 ? "Playfair" : "Georgia, serif";
  const bodyFont = fonts.length > 1 ? "Lora" : "Georgia, serif";

  try {
  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: WHITE,
          display: "flex",
          flexDirection: "column",
          fontFamily: bodyFont,
          color: INK,
        }}
      >
        {/* Yellow banner */}
        <div
          style={{
            backgroundColor: YELLOW,
            padding: "36px 64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: headingFont,
              fontWeight: 700,
              fontSize: 52,
              color: INK,
              letterSpacing: "-1px",
            }}
          >
            PLOTLINE
          </span>
          <span
            style={{
              fontFamily: bodyFont,
              fontSize: 20,
              color: INK,
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            A Story Card
          </span>
        </div>

        {/* Content area */}
        <div
          style={{
            flex: 1,
            padding: "56px 72px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Title */}
          <div
            style={{
              fontFamily: headingFont,
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1.2,
              color: INK,
              marginBottom: 40,
            }}
          >
            {title}
          </div>

          {/* Rule */}
          <div
            style={{
              width: "100%",
              height: 2,
              backgroundColor: INK,
              marginBottom: 40,
            }}
          />

          {/* Story body */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: 1,
            }}
          >
            {lines.map((line, i) => {
              const isName = line.style === "name";
              const isDialogue = line.style === "dialogue";
              const pts = line.points ?? 0;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: isName ? headingFont : bodyFont,
                      fontStyle: isDialogue ? "italic" : "normal",
                      fontWeight: isName ? 700 : 400,
                      fontSize: isName ? 28 : 26,
                      lineHeight: 1.45,
                      color: INK,
                      flex: 1,
                    }}
                  >
                    {line.text}
                  </div>
                  {pts > 0 && (
                    <div
                      style={{
                        backgroundColor: YELLOW,
                        padding: "4px 10px",
                        fontFamily: bodyFont,
                        fontSize: 18,
                        fontWeight: 600,
                        color: INK,
                        whiteSpace: "nowrap",
                        marginTop: 4,
                      }}
                    >
                      {pts} pt{pts !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "28px 72px",
            borderTop: `2px solid ${INK}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: bodyFont, fontSize: 20, color: MUTED, letterSpacing: "1px" }}>
            plotlinegame.com
          </span>
          <span style={{ fontFamily: bodyFont, fontSize: 20, color: MUTED, letterSpacing: "1px" }}>
            #{code}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        // Archived stories never change, so this card is safe to cache
        // forever at the CDN edge.
        "Cache-Control": "public, s-maxage=31536000, immutable",
      },
    }
  );
  } catch (err) {
    console.error("OG image generation failed:", err);
    return new Response("Image generation error", { status: 500 });
  }
}
