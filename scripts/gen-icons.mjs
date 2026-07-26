/**
 * Generates PWA PNG icons from the SVG source.
 * Requires: npm install -D sharp  (or use system imagemagick)
 * Run once: node scripts/gen-icons.mjs
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

let sharp
try {
  const require = createRequire(import.meta.url)
  sharp = require('sharp')
} catch {
  console.error('sharp not installed. Run: npm install -D sharp')
  console.error('Or use ImageMagick: convert -background none icons/icon.svg -resize 192x192 icons/icon-192.png')
  process.exit(1)
}

const svgBuffer = readFileSync(join(root, 'public/icons/icon.svg'))

for (const size of [192, 512]) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(root, `public/icons/icon-${size}.png`))
  console.log(`Generated icon-${size}.png`)
}
