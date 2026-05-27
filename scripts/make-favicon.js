import { writeFileSync } from "node:fs";

const size = 32;
const pixels = Buffer.alloc(size * size * 4);
const C = ["11110", "10000", "10000", "10000", "11110"];
const B = ["11100", "10010", "11100", "10010", "11100"];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const i = (y * size + x) * 4;
    const radius = roundedRectAlpha(x, y, size, 8);
    if (!radius) {
      pixels[i + 3] = 0;
      continue;
    }

    const t = (x + y) / (size * 2);
    const r = Math.round(16 * (1 - t) + 6 * t);
    const g = Math.round(199 * (1 - t) + 148 * t);
    const b = Math.round(107 * (1 - t) + 78 * t);

    pixels[i] = b;
    pixels[i + 1] = g;
    pixels[i + 2] = r;
    pixels[i + 3] = 255;
  }
}

drawEllipse(13, 13, 8, 5, [255, 255, 255, 72]);
drawEllipse(20, 19, 7, 5, [255, 255, 255, 72]);
drawTextBlock();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const directory = Buffer.alloc(16);
directory.writeUInt8(size, 0);
directory.writeUInt8(size, 1);
directory.writeUInt8(0, 2);
directory.writeUInt8(0, 3);
directory.writeUInt16LE(1, 4);
directory.writeUInt16LE(32, 6);

const dibHeader = Buffer.alloc(40);
dibHeader.writeUInt32LE(40, 0);
dibHeader.writeInt32LE(size, 4);
dibHeader.writeInt32LE(size * 2, 8);
dibHeader.writeUInt16LE(1, 12);
dibHeader.writeUInt16LE(32, 14);
dibHeader.writeUInt32LE(0, 16);
dibHeader.writeUInt32LE(pixels.length, 20);

const bitmap = Buffer.alloc(pixels.length);
for (let y = 0; y < size; y += 1) {
  const sourceStart = y * size * 4;
  const targetStart = (size - 1 - y) * size * 4;
  pixels.copy(bitmap, targetStart, sourceStart, sourceStart + size * 4);
}

const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
const image = Buffer.concat([dibHeader, bitmap, mask]);
directory.writeUInt32LE(image.length, 8);
directory.writeUInt32LE(header.length + directory.length, 12);

writeFileSync("public/favicon.ico", Buffer.concat([header, directory, image]));

function roundedRectAlpha(x, y, width, radius) {
  const left = x;
  const right = width - 1 - x;
  const top = y;
  const bottom = width - 1 - y;
  const dx = Math.max(radius - Math.min(left, right), 0);
  const dy = Math.max(radius - Math.min(top, bottom), 0);
  return dx * dx + dy * dy <= radius * radius;
}

function drawEllipse(cx, cy, rx, ry, rgba) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = (x - cx) ** 2 / rx ** 2 + (y - cy) ** 2 / ry ** 2 <= 1;
      if (!inside) continue;
      blendPixel(x, y, rgba);
    }
  }
}

function drawTextBlock() {
  const white = [255, 255, 255, 255];
  drawGlyph(C, 8, 12, white);
  drawGlyph(B, 17, 12, white);
}

function drawGlyph(rows, x, y, rgba) {
  const scale = 2;
  rows.forEach((row, rowIndex) => {
    [...row].forEach((cell, colIndex) => {
      if (cell !== "1") return;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          blendPixel(x + colIndex * scale + xx, y + rowIndex * scale + yy, rgba);
        }
      }
    });
  });
}

function blendPixel(x, y, rgba) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const alpha = rgba[3] / 255;
  pixels[i] = Math.round(pixels[i] * (1 - alpha) + rgba[2] * alpha);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + rgba[1] * alpha);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + rgba[0] * alpha);
  pixels[i + 3] = Math.max(pixels[i + 3], rgba[3]);
}
