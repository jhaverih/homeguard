import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1e3a5f', light: '#2c5282', dark: '#152a47' },
        vendor: { DEFAULT: '#2d4a22', light: '#3a6030', dark: '#1e3217' },
      },
    },
  },
  plugins: [],
};

export default config;
