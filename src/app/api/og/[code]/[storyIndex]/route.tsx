export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
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

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

async function getGoogleFontBuffer(
  family: string,
  params: string
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:${params}&display=swap`;
    const css = await fetch(cssUrl, {
      headers: {
        // Use a UA that gets woff2 back; we'll parse the first URL
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    }).then((r) => r.text());

    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/);
    if (!match) return null;
    return loadFont(match[1]);
  } catch {
    return null;
  }
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

  // Fetch fonts in parallel
  const [playfairBold, loraRegular, loraItalic] = await Promise.all([
    getGoogleFontBuffer("Playfair+Display", "wght@700"),
    getGoogleFontBuffer("Lora", "ital,wght@0,400"),
    getGoogleFontBuffer("Lora", "ital,wght@1,400"),
  ]);

  type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  type FontOption = { name: string; data: ArrayBuffer; weight: Weight; style: "normal" | "italic" };
  const fonts: FontOption[] = [];
  if (playfairBold) fonts.push({ name: "Playfair", data: playfairBold, weight: 700, style: "normal" });
  if (loraRegular) fonts.push({ name: "Lora", data: loraRegular, weight: 400, style: "normal" });
  if (loraItalic) fonts.push({ name: "Lora", data: loraItalic, weight: 400, style: "italic" });

  // Fetch story from DB
  let storyData: {
    title: string;
    lines: { text: string; style: "name" | "location" | "action" | "dialogue" | "ending" }[];
  } | null = null;

  try {
    const db = await getDb();

    const stories = await db
      .select()
      .from(schema.archivedStories)
      .where(eq(schema.archivedStories.roomCode, code));

    const story = stories.find((s: { storyIndex: number }) => s.storyIndex === storyIdx);
    if (story) {
      const prompts = await db
        .select()
        .from(schema.archivedPrompts)
        .where(eq(schema.archivedPrompts.storyId, story.id));

      const sorted = prompts.sort((a: { slot: number }, b: { slot: number }) => a.slot - b.slot);
      const contributions = sorted.map((p: { contribution: string }) => p.contribution);

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
            { text: p1Full, style: "name" },
            { text: `and ${p2Full}`, style: "name" },
            { text: `are ${location},`, style: "location" },
            { text: `${action}.`, style: "action" },
            { text: `${p1Name} says, \u201c${dialogue1}\u201d`, style: "dialogue" },
            { text: `${p2Name} says, \u201c${dialogue2}\u201d`, style: "dialogue" },
            { text: `Then, ${ending}.`, style: "ending" },
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
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: isName ? headingFont : bodyFont,
                    fontStyle: isDialogue ? "italic" : "normal",
                    fontWeight: isName ? 700 : 400,
                    fontSize: isName ? 28 : 26,
                    lineHeight: 1.45,
                    color: INK,
                  }}
                >
                  {line.text}
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
    }
  );
  } catch (err) {
    console.error("OG image generation failed:", err);
    return new Response(
      `Image generation error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }
}
