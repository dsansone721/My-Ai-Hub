import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0d12",
        surface: "#11141b",
        elevated: "#161a23",
        border: "#1f2430",
        muted: "#8a93a6",
        accent: {
          DEFAULT: "#6366f1",
          hover: "#7c7fff",
          soft: "rgba(99, 102, 241, 0.12)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
