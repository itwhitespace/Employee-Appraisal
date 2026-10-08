import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f5f7",
        ink: "#1d1d1f",
        muted: "#6e6e73",
        faint: "#86868b",
        line: "#e5e5ea",
        accent: {
          DEFAULT: "#0071e3",
          hover: "#0077ed",
          soft: "#e8f2fd",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "var(--font-thai)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        float: "0 12px 40px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
