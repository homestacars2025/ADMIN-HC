/** @type {import('tailwindcss').Config} */

/*
 * Colours resolve to the oklch tokens in src/styles/theme.css. The color-mix()
 * wrapper is what lets Tailwind's alpha modifier work against an oklch custom
 * property, so `bg-primary/[0.05]` and `border-black/[0.07]` both behave while
 * oklch stays the single source of truth in the token file.
 */
const token = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(--${name})`
    : `color-mix(in oklch, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: token('brand'),
          foreground: token('brand-foreground'),
          hover: token('brand-hover'),
          subtle: token('brand-subtle'),
        },
        background: token('background'),
        foreground: token('foreground'),
        surface: token('surface'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: token('destructive'),
        success: token('success'),
        warning: token('warning'),
        info: token('info'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          primary: token('sidebar-primary'),
          accent: token('sidebar-accent'),
          border: token('sidebar-border'),
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        '4xl': 'var(--radius-4xl)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      width:   { sidebar: 'var(--sidebar-width)' },
      spacing: { sidebar: 'var(--sidebar-width)' },
    },
  },
  plugins: [],
};
