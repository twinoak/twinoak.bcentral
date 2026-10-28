// Generates the PWA icons (public/icon-192.png, public/icon-512.png) without any image
// library: a navy square with a light disc in the middle. The disc stays inside the 80%
// safe zone, so the same file serves as the maskable icon. Runs before `dev` and `build`;
// the output is gitignored.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NAVY = [0x1f, 0x3a, 0x5f];
const LIGHT = [0xf4, 0xf6, 0xf8];
const SIZES = [192, 512];

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function pixel(x, y, size) {
  const centre = (size - 1) / 2;
  const dx = x - centre;
  const dy = y - centre;
  const radius = size * 0.28;
  return dx * dx + dy * dy <= radius * radius ? LIGHT : NAVY;
}

function png(size) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(publicDir, { recursive: true });
for (const size of SIZES) {
  const file = `${publicDir}icon-${size}.png`;
  writeFileSync(file, png(size));
  console.log(`wrote ${file}`);
}
