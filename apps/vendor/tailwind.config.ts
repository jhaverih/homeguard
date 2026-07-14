import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12181C',
        slate: { DEFAULT: '#26333A', soft: '#33424A' },
        lantern: { DEFAULT: '#F2A93C', deep: '#C97F1F' },
        mist: { DEFAULT: '#EDF1F0', dim: '#DCE4E2' },
        steel: '#5B6B70',
        canvas: '#F5F7F6',
        surface: '#FFFFFF',
        border: '#DEE6E4',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['var(--font-body)', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
