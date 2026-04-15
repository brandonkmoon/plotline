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
        bg: "#06060a",
        surface: "#0e0e14",
        "surface-2": "#16161e",
        border: "#252530",
        text: "#f2ede4",
        "text-dim": "#9a9490",
        "text-muted": "#5c5854",
        "gold-light": "#f5d778",
        gold: "#d4a843",
        "gold-dark": "#b8922d",
        "gold-deep": "#8a6d1f",
        "gold-highlight": "#fce89d",
      },
      fontFamily: {
        display: ["var(--font-new-rocker)", "serif"],
        serif: ["var(--font-cormorant)", "serif"],
        sans: ["var(--font-outfit)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
