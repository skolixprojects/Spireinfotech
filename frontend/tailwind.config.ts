import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00A3A8",   // logo teal at AA contrast on white
          light: "#00CED1",     // bright cyan from logo (highlights / icons)
          dark: "#007E82",      // hover / active fill
        },
        accent: {
          DEFAULT: "#5FE0E3",   // light cyan tint
          light: "#C7F4F5",     // very pale background tint
          dark: "#00B4B8",      // mid cyan
        },
        cream: {
          DEFAULT: "#F0EDE8",   // off-white background
          dark: "#E3DED7",      // slightly darker cream
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Playfair Display", "Georgia", "serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
