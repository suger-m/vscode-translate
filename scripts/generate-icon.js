// One-off script: renders media/icon.png (128x128) - a white globe on a
// rounded, vertically gradient blue square. Run: node scripts/generate-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 128;
const SS = 4; // 4x4 supersampling for smooth edges

const TOP = [0x4c, 0xc2, 0xff]; // #4CC2FF
const BOTTOM = [0x00, 0x7a, 0xcc]; // #007ACC

function inRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function classify(px, py) {
  if (!inRoundedRect(px, py, SIZE, 28)) {
    return [0, 0, 0, 0];
  }

  const t = Math.min(1, Math.max(0, py / SIZE));
  const bg = [0, 1, 2].map((i) => Math.round(TOP[i] + (BOTTOM[i] - TOP[i]) * t));

  const dx = px - SIZE / 2;
  const dy = py - SIZE / 2;
  const d = Math.hypot(dx, dy);
  let white = false;
  if (Math.abs(d - 36) <= 3) {
    white = true; // outer ring
  } else if (Math.abs(dy) <= 2.5 && d <= 39) {
    white = true; // equator
  } else {
    const e = Math.hypot(dx / 18, dy / 36);
    if (Math.abs(e - 1) <= 2.5 / 18 && d <= 40) {
      white = true; // meridian ellipse
    }
  }
  return white ? [255, 255, 255, 255] : [bg[0], bg[1], bg[2], 255];
}

const out = Buffer.alloc(SIZE * SIZE * 4);
const n = SS * SS;
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    let a1 = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = classify(i + (sx + 0.5) / SS, j + (sy + 0.5) / SS);
        const w = ca / 255;
        r1 += cr * w;
        g1 += cg * w;
        b1 += cb * w;
        a1 += w;
      }
    }
    const o = (j * SIZE + i) * 4;
    out[o] = a1 > 0 ? Math.round(r1 / a1) : 0;
    out[o + 1] = a1 > 0 ? Math.round(g1 / a1) : 0;
    out[o + 2] = a1 > 0 ? Math.round(b1 / a1) : 0;
    out[o + 3] = Math.round((a1 / n) * 255);
  }
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let v = 0; v < 256; v++) {
      let c = v;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[v] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA

const stride = SIZE * 4;
const raw = Buffer.alloc((stride + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (stride + 1)] = 0; // filter: none
  out.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const dest = path.join(__dirname, '..', 'media', 'icon.png');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, png);
console.log(`wrote ${dest} (${png.length} bytes)`);
