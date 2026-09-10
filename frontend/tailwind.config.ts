import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // PolinTrack Core Software Brand Tokens (Action Blue)
        primary: {
          DEFAULT: '#1D71CB',
          hover: '#165EA8',
          subtle: '#EFF6FF',
          dark: '#144B84',
        },
        // Structural Navy Tokens (Sidebar / Headings)
        structural: {
          DEFAULT: '#0D1B36',
          sidebar: '#0D1B36',
          subtle: '#1A2E56',
          dark: '#0B162C',
        },
        // Venta de Madera y Pallet Institutional Brand Tokens (Forest Pine)
        institutional: {
          DEFAULT: '#3A6A44',
          hover: '#2E5436',
          subtle: '#F0FDF4',
        },
        // Operational & Ledger Semantic Tokens
        success: {
          DEFAULT: '#16A34A',
          hover: '#15803D',
          subtle: '#F0FDF4',
          border: '#BBF7D0',
        },
        warning: {
          DEFAULT: '#D97706',
          hover: '#B45309',
          subtle: '#FFFBEB',
          border: '#FDE68A',
        },
        destructive: {
          DEFAULT: '#DC2626',
          hover: '#B91C1C',
          subtle: '#FEF2F2',
          border: '#FECACA',
        },
        // Neutral UI Surfaces & Boundaries
        border: '#E2E8F0',
        background: '#F8FAFC',
        card: '#FFFFFF',
        muted: {
          DEFAULT: '#F1F5F9',
          foreground: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px', // Standard for inputs, buttons, and selects
        lg: '8px', // Standard for cards and modals
        xl: '12px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        modal: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
