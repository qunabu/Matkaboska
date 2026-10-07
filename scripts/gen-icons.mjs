/**
 * Generates PWA PNG icons + favicon from the brand master image.
 * Runs automatically on `npm install` via the postinstall hook.
 *
 * Source of truth: public/icons/icon-master.png (the Tęczowa Madonna artwork).
 * Falls back to public/icons/icon.svg if the master is missing. If neither is
 * available (or sharp isn't installed) we do NOTHING and keep the committed
 * PNGs — never overwrite the real icon with a placeholder.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')
const masterPng = join(iconsDir, 'icon-master.png')
const svgPath = join(iconsDir, 'icon.svg')

try {
  const source = existsSync(masterPng) ? masterPng : existsSync(svgPath) ? svgPath : null
  if (!source) throw new Error('no icon-master.png or icon.svg')
  const { default: sharp } = await import('sharp')
  mkdirSync(iconsDir, { recursive: true })
  const input = readFileSync(source)
  const readOpts = source.endsWith('.svg') ? { density: 512 } : {}
  const pngOpts = { quality: 82, compressionLevel: 9, effort: 10 }
  // The artwork runs almost to the edges; Android crops icons to a circle or
  // squircle (maskable safe zone = the central 80%). A black margin keeps the
  // hands and the halo inside it on every launcher.
  const PAD = 0.12
  const padded = async (size) => {
    const inner = Math.round(size * (1 - 2 * PAD))
    const art = await sharp(input, readOpts).resize(inner, inner).toBuffer()
    const off = Math.round((size - inner) / 2)
    return sharp({ create: { width: size, height: size, channels: 3, background: '#000000' } })
      .composite([{ input: art, left: off, top: off }]).png(pngOpts).toBuffer()
  }
  for (const size of [192, 512]) {
    writeFileSync(join(iconsDir, `icon-${size}.png`), await padded(size))
    console.log(`  ✓ public/icons/icon-${size}.png`)
  }
  // The favicon is never masked, so it uses the whole square.
  const fav = await sharp(input, readOpts).resize(48, 48).png({ compressionLevel: 9 }).toBuffer()
  writeFileSync(join(iconsDir, 'favicon-48.png'), fav)
  console.log('  ✓ public/icons/favicon-48.png')
} catch (err) {
  console.warn(`  gen-icons: skipped, keeping existing PNGs (${err.message})`)
}
