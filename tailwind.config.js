/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Semantic tokens: the values live in src/styles/globals.css (light + dark)
      colors: {
        paper: 'var(--paper)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        divider: 'var(--divider)',
        chip: 'var(--chip)',
        primary: 'var(--primary)',
        'primary-wash': 'var(--primary-wash)',
        'primary-text': 'var(--primary-text)',
        danger: 'var(--danger)',
        'danger-wash': 'var(--danger-wash)',
        'danger-text': 'var(--danger-text)',
      },
      // One family, same as admin-eventplus (Inter), loaded with next/font in _app.js
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
