/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#E0F2F1',
          DEFAULT: '#00897B',
          dark: '#004D40',
        },
        secondary: {
          DEFAULT: '#7986CB',
        },
        accent: {
          DEFAULT: '#FFB74D',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#1E1E1E',
        },
        background: {
          light: '#F5F7F9',
          dark: '#121212',
        }
      },
    },
  },
  plugins: [],
}
