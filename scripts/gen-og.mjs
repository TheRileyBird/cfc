import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const W = 1200, H = 630;
const LOGO_SIZE = 220;
const LOGO_X = Math.round((W - LOGO_SIZE) / 2);
const LOGO_Y = Math.round((H - LOGO_SIZE) / 2) - 40;

// Resize logo to target size with transparency preserved
const logoBuffer = await sharp(join(root, 'src/assets/images/cfc-logo.png'))
  .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// SVG overlay: tagline text + hairline rules
const textSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <!-- Hairline rule left -->
  <rect x="${W/2 - 120}" y="${LOGO_Y + LOGO_SIZE + 36}" width="50" height="0.75" fill="oklch(64% 0.115 72)"/>
  <!-- Hairline rule right -->
  <rect x="${W/2 + 70}" y="${LOGO_Y + LOGO_SIZE + 36}" width="50" height="0.75" fill="oklch(64% 0.115 72)"/>
  <!-- Tagline -->
  <text
    x="50%" y="${LOGO_Y + LOGO_SIZE + 56}"
    font-family="Georgia, serif"
    font-size="13"
    letter-spacing="5"
    fill="oklch(80% 0.08 78)"
    text-anchor="middle"
    dominant-baseline="middle"
  >CLEANSE · TREAT · PROTECT</text>
  <!-- Sub -->
  <text
    x="50%" y="${LOGO_Y + LOGO_SIZE + 82}"
    font-family="Georgia, serif"
    font-size="11"
    letter-spacing="3"
    fill="oklch(64% 0.115 72 / 0.5)"
    text-anchor="middle"
    dominant-baseline="middle"
  >CFCSKINCARE.COM</text>
</svg>
`;

const textBuffer = Buffer.from(textSvg);

await sharp({
  create: { width: W, height: H, channels: 3, background: { r: 13, g: 13, b: 18 } },
})
  .composite([
    { input: logoBuffer, top: LOGO_Y, left: LOGO_X },
    { input: textBuffer, top: 0, left: 0 },
  ])
  .jpeg({ quality: 92 })
  .toFile(join(root, 'public/og-image.jpg'));

console.log('✓ public/og-image.jpg created (1200×630)');
