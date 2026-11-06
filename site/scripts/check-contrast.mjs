#!/usr/bin/env node
/**
 * WCAG contrast for the token pairs the pages actually paint. Colours are read
 * from tokens.css, converted from OKLCH to sRGB, and compared; the pairs below
 * are the only combinations the layout uses, so a passing run covers the page.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..')
const css = readFileSync(resolve(SITE, 'src/styles/tokens.css'), 'utf8')

const tokens = new Map()
for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*oklch\(([^)]+)\)/g)) {
  const value = parseOklch(match[2])
  if (value) tokens.set(match[1], value)
}

/** [text token, background token, minimum ratio, why] */
const pairs = [
  ['ink', 'paper', 4.5, 'body copy'],
  ['ink-2', 'paper', 4.5, 'secondary body'],
  ['muted', 'paper', 4.5, 'captions and meta'],
  ['ink-2', 'paper-2', 4.5, 'panel copy'],
  ['muted', 'paper-2', 4.5, 'panel captions'],
  ['ink-2', 'paper-3', 4.5, 'code block copy'],
  ['accent', 'paper', 4.5, 'amber labels and links'],
  ['accent-ink', 'accent', 4.5, 'primary button text'],
  ['cool', 'paper', 4.5, 'Context7 row labels'],
  ['ok', 'paper', 4.5, 'diff additions'],
  ['bad', 'paper', 4.5, 'diff deletions'],
  ['focus', 'paper', 3, 'focus ring'],
  ['rule', 'paper', 1.2, 'hairline (non-text)'],
  ['muted', 'paper-3', 3, 'search field edge'],
]

const failures = []
for (const [foreground, background, minimum, why] of pairs) {
  const a = tokens.get(foreground)
  const b = tokens.get(background)
  if (!a || !b) {
    failures.push(`missing token: --color-${a ? background : foreground}`)
    continue
  }
  const ratio = contrast(a, b)
  const verdict = ratio >= minimum ? 'ok' : 'FAIL'
  if (ratio < minimum) failures.push(`${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1 (${why})`)
  console.log(`${verdict.padEnd(4)} ${foreground} on ${background}: ${ratio.toFixed(2)}:1 (${why})`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`dsh-plugins site: ${failure}`)
  process.exit(1)
}

/* ---------------------------------------------------------------- helpers */

function parseOklch(source) {
  const parts = source.trim().replace(/\//g, ' / ').split(/\s+/)
  if (parts.length < 3) return null
  const lightness = parts[0].endsWith('%') ? Number.parseFloat(parts[0]) / 100 : Number.parseFloat(parts[0])
  const chroma = Number.parseFloat(parts[1])
  const hue = Number.parseFloat(parts[2])
  return { lightness, chroma, hue }
}

/** OKLCH to linear sRGB, then to relative luminance. */
function luminance({ lightness, chroma, hue }) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(a, b) {
  const light = Math.max(luminance(a), luminance(b))
  const dark = Math.min(luminance(a), luminance(b))
  return (light + 0.05) / (dark + 0.05)
}

function clamp(value) {
  return Math.min(1, Math.max(0, value))
}
