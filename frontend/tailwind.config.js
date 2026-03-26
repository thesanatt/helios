/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sun: "#fbbf24",
        aurora: { green: "#22c55e", purple: "#a855f7" },
        storm: "#ef4444",
      },
    },
  },
  plugins: [],
};
