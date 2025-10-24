/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        'xs': ['clamp(0.625rem, 0.7vw + 0.5rem, 0.75rem)', { lineHeight: '1rem' }],
        'sm': ['clamp(0.75rem, 0.75vw + 0.6rem, 0.875rem)', { lineHeight: '1.25rem' }],
        'base': ['clamp(0.875rem, 0.8vw + 0.7rem, 1rem)', { lineHeight: '1.5rem' }],
        'lg': ['clamp(1rem, 0.9vw + 0.8rem, 1.125rem)', { lineHeight: '1.75rem' }],
        'xl': ['clamp(1.125rem, 1vw + 0.9rem, 1.25rem)', { lineHeight: '1.75rem' }],
        '2xl': ['clamp(1.25rem, 1.2vw + 1rem, 1.5rem)', { lineHeight: '2rem' }],
        '3xl': ['clamp(1.5rem, 1.5vw + 1.2rem, 1.875rem)', { lineHeight: '2.25rem' }],
        '4xl': ['clamp(1.75rem, 2vw + 1.4rem, 2.25rem)', { lineHeight: '2.5rem' }],
        '5xl': ['clamp(2rem, 2.5vw + 1.6rem, 3rem)', { lineHeight: '1' }],
      },
      spacing: {
        'responsive-xs': 'clamp(0.25rem, 0.5vw + 0.1rem, 0.5rem)',
        'responsive-sm': 'clamp(0.5rem, 1vw + 0.2rem, 1rem)',
        'responsive-md': 'clamp(0.75rem, 1.5vw + 0.3rem, 1.5rem)',
        'responsive-lg': 'clamp(1rem, 2vw + 0.5rem, 2rem)',
        'responsive-xl': 'clamp(1.5rem, 3vw + 0.75rem, 3rem)',
        'responsive-2xl': 'clamp(2rem, 4vw + 1rem, 4rem)',
      },
      screens: {
        'xs': '375px',
        '3xl': '1920px',
        '4xl': '2560px',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      maxWidth: {
        'screen-3xl': '1920px',
        'screen-4xl': '2560px',
      },
    },
  },
  plugins: [],
}
