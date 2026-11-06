#!/usr/bin/env node
/**
 * The committed data is a snapshot: this guard fails when the checkout has
 * moved past it, so a deploy never ships a stale commit graph without anyone
 * noticing. Fix: `pnpm sync` and commit the two JSON files.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..')
const REPO = resolve(SITE, '..')

const graph = JSON.parse(readFileSync(resolve(SITE, 'src/data/repo-graph.json'), 'utf8'))
const meta = JSON.parse(readFileSync(resolve(SITE, 'src/data/plugins-meta.json'), 'utf8'))

const problems = []

let head = ''
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
} catch {
  console.warn('dsh-plugins site: no git checkout here; skipping the HEAD comparison')
}

if (head && graph.source.head !== head) {
  problems.push(
    `commit graph is at ${graph.source.head.slice(0, 7)}, repository is at ${head.slice(0, 7)}: run \`pnpm sync\` and commit src/data/*.json`,
  )
}

for (const [slug, expected] of Object.entries(meta)) {
  const manifest = JSON.parse(readFileSync(resolve(REPO, slug, 'package.json'), 'utf8'))
  if (manifest.version !== expected.version) {
    problems.push(`${slug}: data says ${expected.version}, package.json says ${manifest.version}`)
  }
  if (manifest.name !== expected.name) {
    problems.push(`${slug}: data says ${expected.name}, package.json says ${manifest.name}`)
  }
}

if (!Array.isArray(graph.commits) || graph.commits.length === 0) {
  problems.push('commit graph is empty')
}
if (graph.commits.length !== graph.layout.rows.length) {
  problems.push('commit list and lane rows disagree')
}
if (graph.layout.rows.some((row) => row.lane >= graph.layout.laneCount)) {
  problems.push('a lane row points past laneCount')
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`dsh-plugins site: ${problem}`)
  process.exit(1)
}

console.log(`dsh-plugins site: data covers ${graph.commits.length} commits at ${graph.source.head.slice(0, 7)}`)
