import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "#FDFBF7",
          100: "#F8F4EC",
          200: "#EFE9DC",
          300: "#E2D9C6",
        },
        ink: {
          50: "#F5F4F2",
          900: "#1C1917",
          950: "#121110",
        },
        accent: {
          50: "#FBF6EA",
          100: "#F5EBD3",
          400: "#D9A441",
          500: "#C08A2D",
          600: "#A16A1F",
          700: "#84531B",
          800: "#6B431C",
        },
        night: {
          50: "#F1F5F9",
          700: "#1E293B",
          800: "#131C2E",
          900: "#0B1120",
          950: "#05080F",
        },
      },
      fontFamily: {
        body: ["var(--font-body)", "Amiri", "serif"],
        ui: ["var(--font-ui)", "Readex Pro", "sans-serif"],
      },
      fontSize: {
        "article-base": ["1.1875rem", { lineHeight: "2.4" }],
        "article-tashkeel": ["1.375rem", { lineHeight: "2.8" }],
      },
      borderRadius: {
        xl2: "1rem",
      },
      boxShadow: {
        soft: "0 2px 20px -6px rgba(28, 25, 23, 0.08)",
        lift: "0 12px 40px -12px rgba(28, 25, 23, 0.16)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 2.4s linear infinite",
      },
      transitionTimingFunction: {
        fluid: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
