/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      fontSize: {
        'xs': ['clamp(0.5rem, 0.6vw, 0.75rem)', { lineHeight: '1rem' }],
        'sm': ['clamp(0.625rem, 0.7vw, 0.875rem)', { lineHeight: '1.25rem' }],
        'base': ['clamp(0.75rem, 0.8vw, 1rem)', { lineHeight: '1.5rem' }],
        'lg': ['clamp(0.875rem, 0.9vw, 1.125rem)', { lineHeight: '1.75rem' }],
        'xl': ['clamp(1rem, 1vw, 1.25rem)', { lineHeight: '1.75rem' }],
        '2xl': ['clamp(1.125rem, 1.2vw, 1.5rem)', { lineHeight: '2rem' }],
        '3xl': ['clamp(1.25rem, 1.5vw, 1.875rem)', { lineHeight: '2.25rem' }],
        '4xl': ['clamp(1.5rem, 1.8vw, 2.25rem)', { lineHeight: '2.5rem' }],
      },
      spacing: {
        'responsive-xs': 'clamp(0.25rem, 0.5vw, 0.5rem)',
        'responsive-sm': 'clamp(0.5rem, 1vw, 1rem)',
        'responsive-md': 'clamp(0.75rem, 1.5vw, 1.5rem)',
        'responsive-lg': 'clamp(1rem, 2vw, 2rem)',
        'responsive-xl': 'clamp(1.5rem, 3vw, 3rem)',
      },
    },
  },
  plugins: [],
}
