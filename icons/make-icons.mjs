// 아이콘 생성: node icons/make-icons.mjs  →  icon16.png, icon48.png, icon128.png
// 외부 라이브러리 없이 직접 그림 (인디고 둥근 사각형 + 흰 카드 + 텍스트 줄 3개).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [79, 70, 229], WHITE = [255, 255, 255];
const inRR = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// (0..1 좌표) 한 점의 색과 알파
function sample(x, y) {
  if (!inRR(x, y, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0];
  if (inRR(x, y, 0.24, 0.18, 0.76, 0.82, 0.06)) {
    const line = [[0.34, 0.66], [0.48, 0.66], [0.62, 0.54]].some(([cy, x1]) => Math.abs(y - cy) < 0.035 && x >= 0.33 && x <= x1);
    return [...(line ? BG : WHITE), 1];
  }
  return [...BG, 1];
}

function render(size) {
  const N = 4; // 4x4 슈퍼샘플링으로 가장자리 부드럽게
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // 필터 없음
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const [sr, sg, sb, sa] = sample((px + (i + 0.5) / N) / size, (py + (j + 0.5) / N) / size);
        r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0;
      raw[o + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return png(size, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8비트 RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [16, 48, 128]) writeFileSync(new URL(`./icon${s}.png`, import.meta.url), render(s));
console.log('done');
