/**
 * Generates PWA PNG icons from the real brand logo (public/icons/icon.svg).
 * Runs automatically on `npm install` via the postinstall hook.
 *
 * If sharp (a transitive dependency) or the SVG is unavailable, we deliberately
 * do NOTHING and keep the committed PNGs — never overwrite the real icon with a
 * placeholder. (An earlier version wrote solid-green squares here, which made the
 * home-screen icon look "missing" after every install/deploy.)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')
const svgPath = join(iconsDir, 'icon.svg')

try {
  if (!existsSync(svgPath)) throw new Error('icon.svg not found')
  const { default: sharp } = await import('sharp')
  mkdirSync(iconsDir, { recursive: true })
  const svg = readFileSync(svgPath)
  for (const size of [192, 512]) {
    const png = await sharp(svg, { density: 512 }).resize(size, size).png().toBuffer()
    writeFileSync(join(iconsDir, `icon-${size}.png`), png)
    console.log(`  ✓ public/icons/icon-${size}.png (from icon.svg)`)
  }
} catch (err) {
  console.warn(`  gen-icons: skipped, keeping existing PNGs (${err.message})`)
}
