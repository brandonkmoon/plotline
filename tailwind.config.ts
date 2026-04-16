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
        bg: "#ffffff",
        ink: "#1a1a1a",
        "text-dim": "#666666",
        "text-muted": "#999999",
        "list-border": "#d0d0d0",
        "input-border": "#e0e0e0",
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
