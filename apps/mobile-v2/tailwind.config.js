const { themes, radius, fonts } = require('./theme.config');

const kebab = (k) => k.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

// Semantik renkler CSS değişkenine bağlanır; light/dark değerleri global.css'te.
// Böylece `bg-card` tek sınıf iki temada da doğru boyar.
const colors = Object.fromEntries(
  Object.keys(themes.light).map((key) => [kebab(key), `var(--c-${kebab(key)})`])
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: {
        control: `${radius.control}px`,
        surface: `${radius.surface}px`,
        overlay: `${radius.overlay}px`,
      },
      fontFamily: {
        // 'font-medium'/'font-bold' Tailwind'de fontWeight sınıfı; statik font
        // yüzlerinde ağırlık+aile birlikte verilince Android sentetik kalın yapar.
        // Bu yüzden aile sınıfları 'inter-' önekli ve ağırlık sınıfı kullanılmıyor.
        inter: [fonts.sans],
        'inter-medium': [fonts.sansMedium],
        'inter-semibold': [fonts.sansSemibold],
        'inter-bold': [fonts.sansBold],
        display: [fonts.display],
        'display-semibold': [fonts.displaySemibold],
      },
      letterSpacing: { display: '-0.015em' },
    },
  },
  plugins: [],
};
