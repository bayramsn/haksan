/**
 * Yer tutucu ikon/splash üretir — tasarımcı gerçek varlıkları verene kadar
 * app.config.ts'in kırık referans göstermemesi için. Çalıştır: node assets/make-placeholders.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** `pixel(x, y)` -> [r, g, b, a]; RGBA8 PNG yazar. */
function png(path, size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, colour type 6 (RGBA)
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// apps/web/src/styles/theme.css --brand-blue: #000c69
const BRAND = [0, 12, 105];

/** Ortalanmış kaba bir "H": iki dikey kol + orta bağlantı. */
const isGlyph = (x, y, s) => {
  const w = s * 0.14, l = s * 0.3, r = s * 0.7, top = s * 0.28, bot = s * 0.72;
  if (y < top || y > bot) return false;
  const onLeg = Math.abs(x - l) < w / 2 || Math.abs(x - r) < w / 2;
  const onBar = x > l && x < r && Math.abs(y - s / 2) < w / 2;
  return onLeg || onBar;
};

png('assets/icon.png', 1024, (x, y, s) => (isGlyph(x, y, s) ? [255, 255, 255, 255] : [...BRAND, 255]));
png('assets/adaptive-icon.png', 1024, (x, y, s) => (isGlyph(x, y, s) ? [255, 255, 255, 255] : [0, 0, 0, 0]));
png('assets/splash-icon.png', 512, (x, y, s) => (isGlyph(x, y, s) ? [...BRAND, 255] : [0, 0, 0, 0]));
png('assets/notification-icon.png', 96, (x, y, s) => (isGlyph(x, y, s) ? [255, 255, 255, 255] : [0, 0, 0, 0]));
console.log('placeholder assets written');
