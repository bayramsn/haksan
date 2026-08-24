/**
 * global.css'i theme.config.js'ten üretir.
 *
 * İkisi elle senkron tutuluyordu ve global.css'in kendi başındaki not bunun
 * ayrışacağını söylüyordu — palet kırmızıya çevrilirken tam da bu oldu. Artık
 * tek kaynak theme.config.js; bu betik NativeWind'in okuduğu CSS değişkenlerini
 * ondan yazıyor.
 *
 * Çalıştır: npm run gen:css   (paleti her değiştirdiğinde)
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { themes } = require(resolve(here, '../theme.config.js'));

const kebab = (key) => key.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
const vars = (theme, indent) =>
  Object.entries(theme)
    .map(([key, value]) => `${indent}--c-${kebab(key)}: ${value};`)
    .join('\n');

const css = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ÜRETİLMİŞ DOSYA — elle düzenleme. Kaynak: theme.config.js
   Yeniden üretmek için: npm run gen:css */
:root {
${vars(themes.light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root {
${vars(themes.dark, '    ')}
  }
}
`;

writeFileSync(resolve(here, '../global.css'), css);
console.log('global.css üretildi');
