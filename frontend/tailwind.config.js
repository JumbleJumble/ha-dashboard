/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "'Plus Jakarta Sans Variable'",
          "'Plus Jakarta Sans'",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif",
        ],
      },
      colors: {
        ink: {
          bg: "#0c0b0a",
          card: "#19171a",
          text: "#f5f2ef",
          muted: "#8a8580",
          dim: "#55504b",
        },
      },
    },
  },
  plugins: [],
};
