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
        // Brand abstraction (Phase 1D): use bg-brand / text-brand /
        // border-brand and they pick up the CSS variables injected
        // by layout.tsx from BRAND.colors. Components added going
        // forward should prefer these over hardcoded hex.
        brand: {
          DEFAULT: "var(--brand-primary)",
          dark: "var(--brand-primary-dark)",
          light: "var(--brand-primary-light)",
        },
        "brand-accent": "var(--brand-accent)",
        primary: {
          DEFAULT: "#0F766E",   // Tailwind teal-700: primary buttons, solid fills
          light: "#14B8A6",     // Tailwind teal-500: gradient end, highlights
          dark: "#134E4A",      // Tailwind teal-900: deep accents
        },
        accent: {
          DEFAULT: "#14B8A6",   // Tailwind teal-500
          light: "#F0FDFA",     // Tailwind teal-50: pale tint background
          dark: "#0D9488",      // Tailwind teal-600: hover variant
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
