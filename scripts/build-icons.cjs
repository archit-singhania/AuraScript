'use strict';
// Platform exports of the original vector mark. No downloaded artwork is used.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..', 'assets');
const SIZE = 256,
  SCALE = 3;
function distance(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const silver = [
  [88, 68, 36, 128],
  [36, 128, 88, 188],
  [168, 68, 220, 128],
  [220, 128, 168, 188],
];
const violet = [
  [148, 51, 102, 205],
  [122, 94, 163, 128],
  [163, 128, 108, 162],
];
function pixel(x, y) {
  const qx = Math.abs(x - 128) - 65,
    qy = Math.abs(y - 128) - 65;
  const rounded = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 59;
  if (rounded > 0) return [0, 0, 0, 0];
  const t = (x + y) / 512;
  let rgb = [23 + 25 * t, 27 + 14 * t, 44 + 28 * t];
  if (silver.some((v) => distance(x, y, v.slice(0, 2), v.slice(2)) <= 6)) rgb = [219, 219, 234];
  if (violet.some((v) => distance(x, y, v.slice(0, 2), v.slice(2)) <= 5.5))
    rgb = [223 - 55 * t, 220 - 67 * t, 255 - 18 * t];
  return [...rgb, 255];
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const channels = [0, 0, 0, 0];
    for (let sy = 0; sy < SCALE; sy++)
      for (let sx = 0; sx < SCALE; sx++) {
        const values = pixel(x + (sx + 0.5) / SCALE, y + (sy + 0.5) / SCALE);
        values.forEach((v, i) => {
          channels[i] += v;
        });
      }
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    channels.forEach((v, i) => {
      raw[offset + i] = Math.round(v / (SCALE * SCALE));
    });
  }
}
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(name, data) {
  const type = Buffer.from(name),
    content = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of content) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  content.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'icon.png'), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([ico, png]));
console.log('Original AuraScript PNG and Windows ICO exports generated.');
