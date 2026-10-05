import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const outputDirectory = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(outputDirectory, { recursive: true });

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length);
  return result;
}

function encodePng(width, height, pixelAt) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * (1 + width * 4) + 1 + x * 4;
      const color = pixelAt(x, y);
      for (let component = 0; component < 4; component += 1) {
        scanlines[offset + component] = color[component];
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const corners = [
  [[255, 0, 0, 255], [0, 255, 0, 255], [255, 255, 0, 255], [255, 255, 255, 255]],
  [[0, 0, 255, 255], [255, 0, 255, 255], [0, 255, 255, 255], [0, 0, 0, 255]]
];
writeFileSync(new URL('corners_4x2.png', outputDirectory),
  encodePng(4, 2, (x, y) => corners[y][x]));

for (const size of [16, 32, 64, 128]) {
  const colors = [
    [255, 0, 0, 255], [0, 255, 0, 255],
    [0, 0, 255, 255], [255, 255, 255, 255]
  ];
  writeFileSync(new URL('opaque_' + size + 'x' + size + '.png', outputDirectory),
    encodePng(size, size, (x, y) => colors[(x + y) % colors.length]));
}
