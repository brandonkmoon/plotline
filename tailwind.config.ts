import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Playbill palette — flat theater-program aesthetic.
        // Tokens reference the CSS variables in globals.css (:root) so the
        // palette lives in one place. `ink` and `banner` are kept as hex
        // literals here because they're used with Tailwind /opacity
        // modifiers (e.g. bg-ink/60), which require a resolvable color;
        // they mirror --ink / --banner and must stay in sync.
        bg: "var(--bg)",
        ink: "#1a1a1a",
        "text-dim": "var(--text-dim)",
        "text-muted": "var(--text-muted)",
        "list-border": "var(--list-border)",
        "input-border": "var(--input-border)",
        banner: "#fceb00",
      },
      fontFamily: {
        // `serif` = Playfair Display — headings, section labels, buttons.
        serif: ["var(--font-playfair)", "serif"],
        // `body` = Lora — literary content, story prose, prompts.
        body: ["var(--font-lora)", "serif"],
        // `sans` = Inter — UI, labels, badges, timers.
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
