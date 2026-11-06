#!/usr/bin/env node
/**
 * Crawl the built site: every internal href, src and hreflang must resolve to a
 * file in dist, and every #fragment must exist as an id in its target page.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..')
const DIST = join(SITE, 'dist')

const files = walk(DIST).filter((file) => file.endsWith('.html'))
const idsByFile = new Map()
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  idsByFile.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])))
}

const broken = []
const checked = new Set()

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  for (const match of html.matchAll(/(href|src)="([^"]+)"/g)) {
    const [, attribute, href] = match
    if (!href || /^(https?:|mailto:|tel:|data:|javascript:)/.test(href)) continue
    const [pathPart, fragment] = href.split('#')
    const target = resolveTarget(file, pathPart)
    const key = `${relative(DIST, file)} -> ${href}`
    if (checked.has(key)) continue
    checked.add(key)

    if (pathPart && !target) {
      broken.push(`${relative(DIST, file)}: ${attribute}="${href}" points at nothing`)
      continue
    }
    if (fragment && target && target.endsWith('.html')) {
      const ids = idsByFile.get(target)
      if (!ids) {
        broken.push(`${relative(DIST, file)}: "#${fragment}" targets a non-HTML file (${relative(DIST, target)})`)
      } else if (!ids.has(fragment)) {
        broken.push(`${relative(DIST, file)}: "#${fragment}" is not an id in ${relative(DIST, target)}`)
      }
    }
  }
}

if (broken.length > 0) {
  for (const problem of broken) console.error(`dsh-plugins site: ${problem}`)
  process.exit(1)
}

console.log(`dsh-plugins site: ${checked.size} internal links resolved across ${files.length} pages`)

/* ---------------------------------------------------------------- helpers */

function walk(directory) {
  const entries = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) entries.push(...walk(path))
    else entries.push(path)
  }
  return entries
}

/** Resolve one URL path against dist, returning the file or entry HTML it names. */
function resolveTarget(fromFile, pathPart) {
  if (pathPart === '') return fromFile
  const base = pathPart.startsWith('/') ? join(DIST, pathPart) : resolve(dirname(fromFile), pathPart)
  if (isFile(base)) return base
  if (isDir(base) && isFile(join(base, 'index.html'))) return join(base, 'index.html')
  if (isFile(`${base}.html`)) return `${base}.html`
  return null
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
