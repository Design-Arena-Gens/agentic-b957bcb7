import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#FFB703',
          dark: '#FB8500'
        },
        night: '#023047',
        sky: '#8ECAE6'
      }
    }
  },
  plugins: []
};

export default config;
