/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        modalIn: {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        dropdownIn: {
          '0%': { opacity: '0', transform: 'scale(0.94) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        modalIn: 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        dropdownIn: 'dropdownIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        slideUp: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
};
