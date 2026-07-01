import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const SHIPS_DIR = join(import.meta.dirname, '../public/assets/ships');

function alphaForPixel(r, g, b, a) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);

  // Белый / светлый фон
  if (min > 235) return 0;
  if (min > 210 && max - min < 18) {
    return Math.min(a, Math.round(((235 - min) / 25) * 255));
  }

  // Чёрный фон
  if (max < 32) return 0;
  if (max < 90) {
    const edge = Math.round(((max - 32) / 58) * 255);
    return Math.min(a, edge);
  }
  return a;
}

async function stripBlackBg(filePath) {
  const img = sharp(filePath);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = alphaForPixel(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png({ compressionLevel: 9 }).toFile(filePath);

  console.log(`OK ${filePath.split(/[/\\]/).pop()} (${info.width}x${info.height})`);
}

const files = await readdir(SHIPS_DIR);
for (const name of files) {
  if (!name.endsWith('.png') || name === 'ocean-bg.png') continue;
  await stripBlackBg(join(SHIPS_DIR, name));
}
