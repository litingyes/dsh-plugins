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

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Run git for its exit status only. */
function gitOk(args) {
  try {
    execFileSync('git', args, { cwd: REPO, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (head && graph.source.head !== head) {
  if (!gitOk(['merge-base', '--is-ancestor', graph.source.head, head])) {
    problems.push(
      `commit graph is at ${graph.source.head.slice(0, 7)}, which is not an ancestor of HEAD ${head.slice(0, 7)}: run \`pnpm sync\` and commit src/data/*.json`,
    )
  } else {
    // Commits that only touch the portal or the repository's own tooling are the
    // site's bookkeeping; the graph may lag those, but never a plugin change.
    // Root prefixes only: `dsh-git/scripts/...` is plugin code and stays counted.
    const BOOKKEEPING = new Set(['README.md', 'AGENTS.md', 'LICENSE'])
    const BOOKKEEPING_PREFIXES = ['site/', '.github/', 'scripts/']
    const changed = (git(['diff', '--name-only', `${graph.source.head}..${head}`]) ?? '')
      .split('\n')
      .filter(Boolean)
    const code = changed.filter(
      (file) =>
        !BOOKKEEPING.has(file) && !BOOKKEEPING_PREFIXES.some((prefix) => file.startsWith(prefix)),
    )
    if (code.length > 0) {
      problems.push(
        `code changed since the graph (${code.slice(0, 3).join(', ')}${code.length > 3 ? ', ...' : ''}): run \`pnpm sync\` and commit src/data/*.json`,
      )
    }
  }
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
