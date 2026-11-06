#!/usr/bin/env node
/**
 * Build the site's data from the repository itself.
 *
 * Two products come out of here, both committed to the repository so that a
 * deploy never needs git history (Vercel clones shallowly):
 *
 *   src/data/repo-graph.json   the real commit graph, laid out by the plugin's
 *                              own lane algorithm, plus details for the newest
 *                              commits and the real branch list
 *   src/data/plugins-meta.json name, version and DSH range of each plugin,
 *                              read from the plugin package manifests
 *
 * Run with `pnpm sync` after new commits; `pnpm check` fails when the fixture
 * no longer covers the checked-out HEAD.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(HERE, '..')
const REPO = resolve(SITE, '..')
const DATA = join(SITE, 'src', 'data')
const ICONS = join(SITE, 'public', 'icons')

const GRAPH_LIMIT = 40
const DETAIL_LIMIT = 4
const FILE_LIMIT = 50
const DIFF_LIMIT = 20

const RECORD = '\x1e'
const FIELD = '\x1f'

/** Run git in the repository, returning trimmed UTF-8 output. */
function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).replace(/\s+$/, '')
  } catch (error) {
    if (allowFail) return null
    const detail = String(error.stderr ?? error.message).trim().split('\n')[0]
    console.error(`dsh-plugins site: git ${args[0]} failed — ${detail}`)
    process.exit(1)
  }
}

function fail(message) {
  console.error(`dsh-plugins site: ${message}`)
  process.exit(1)
}

function writeJson(name, value) {
  writeFileSync(join(DATA, name), `${JSON.stringify(value, null, 2)}\n`)
}

/* ---------------------------------------------------------------- guards */

if (!existsSync(join(REPO, 'dsh-git', 'package.json')) || !existsSync(join(REPO, 'dsh-context7', 'package.json'))) {
  fail(`expected dsh-git/ and dsh-context7/ beside ${SITE}; run this script from inside the repository`)
}

const inside = git(['rev-parse', '--is-inside-work-tree'], { allowFail: true })
if (inside !== 'true') fail('not a git work tree; the commit graph needs the plugin repository checkout')

if (git(['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true') {
  console.warn('dsh-plugins site: shallow clone — the commit graph will only cover the fetched commits')
}

/* --------------------------------------------------------------- plugins */

const PLUGINS = ['dsh-git', 'dsh-context7']
const pluginsMeta = {}

for (const slug of PLUGINS) {
  const manifest = JSON.parse(readFileSync(join(REPO, slug, 'package.json'), 'utf8'))
  pluginsMeta[slug] = {
    name: manifest.name,
    version: manifest.version,
    dsh: manifest.engines?.dsh ?? '',
    description: manifest.description ?? '',
    homepage: manifest.homepage ?? '',
  }
  const icon = join(REPO, slug, 'icon.svg')
  if (!existsSync(icon)) fail(`missing ${slug}/icon.svg`)
  copyFileSync(icon, join(ICONS, `${slug}.svg`))
}

/* ----------------------------------------------------------------- graph */

const head = git(['rev-parse', 'HEAD'])
const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const headDate = git(['show', '-s', '--format=%cs', head])
const total = Number(git(['rev-list', '--all', '--count']))

const logFormat = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s'].join('%x1f') + '%x1e'
const raw = git(['log', '--all', '--date-order', `--max-count=${GRAPH_LIMIT}`, '--parents', `--pretty=format:${logFormat}`])

const commits = raw
  .split(RECORD)
  .map((record) => record.replace(/^\n+/, ''))
  .filter(Boolean)
  .map((record) => {
    const [sha, parents, author, email, at, decoration, subject] = record.split(FIELD)
    return {
      sha,
      parents: parents ? parents.split(' ') : [],
      author,
      email,
      date: new Date(Number(at) * 1000).toISOString().slice(0, 10),
      subject,
      refs: parseRefs(decoration),
    }
  })

if (commits.length === 0) fail('git log returned no commits')

const { layoutGraph } = await import(join(REPO, 'dsh-git', 'src', 'shared', 'graph.js'))
const layout = layoutGraph(commits)

/* The graph's branch filter needs reachability, which the lane rows do not carry. */
const onCurrent = new Set(git(['rev-list', 'HEAD']).split('\n'))
for (const commit of commits) commit.onCurrent = onCurrent.has(commit.sha)

const branches = git([
  'for-each-ref',
  '--format=%(refname:short)%09%(objectname)%09%(upstream:short)%09%(committerdate:short)%09%(HEAD)%09%(symref)',
  'refs/heads',
])
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [name, sha, upstream, date, marker, symref] = line.split('\t')
    return { name, sha, short: sha.slice(0, 7), upstream: upstream ?? '', date, current: marker === '*', symref: symref ?? '' }
  })

const details = {}
for (const commit of commits.slice(0, DETAIL_LIMIT)) {
  details[commit.sha] = commitDetail(commit)
}

const graph = {
  source: {
    head,
    headShort: head.slice(0, 7),
    headDate,
    currentBranch,
    total,
    limit: GRAPH_LIMIT,
    truncated: total > commits.length,
  },
  commits,
  layout,
  branches,
  details,
}

/* ----------------------------------------------------------------- write */

mkdirSync(DATA, { recursive: true })
mkdirSync(ICONS, { recursive: true })
writeJson('plugins-meta.json', pluginsMeta)
writeJson('repo-graph.json', graph)

console.log(
  `dsh-plugins site: ${commits.length} commits (${total} in repo) · ${layout.laneCount} lanes · ` +
    `${Object.keys(details).length} details · ${branches.length} branches · head ${head.slice(0, 7)} (${currentBranch})`,
)

/* ---------------------------------------------------------------- helpers */

/**
 * `%D` is a comma-joined decoration list. Keep the refs a reader can act on:
 * branches, remote branches and tags. `HEAD -> x` and `origin/HEAD` are dropped
 * because the row already shows the branch, and the branch table marks current.
 */
function parseRefs(decoration) {
  if (!decoration) return []
  const refs = []
  for (const part of decoration.split(', ')) {
    const ref = part.trim()
    if (!ref || ref === 'HEAD') continue
    if (ref.startsWith('HEAD -> ')) continue
    if (ref === 'origin/HEAD') continue
    if (ref.startsWith('tag: ')) {
      refs.push({ name: ref.slice(5), kind: 'tag' })
    } else if (ref.startsWith('origin/')) {
      refs.push({ name: ref, kind: 'remote' })
    } else {
      refs.push({ name: ref, kind: 'branch' })
    }
  }
  return refs.slice(0, 4)
}

/** Message, people, changed files and a small real diff for one commit. */
function commitDetail(commit) {
  const sha = commit.sha
  const people = git(['show', '-s', `--format=%an%x1f%ae%x1f%cn%x1f%ce%x1f%cI`, sha]).split(FIELD)
  const message = git(['show', '-s', '--format=%B', sha]).replace(/\s+$/, '')

  const status = git(['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', '--root', sha])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, ...path] = line.split('\t')
      return { status: code.slice(0, 1), path: path.join('\t') }
    })

  const numstat = new Map()
  for (const line of git(['diff-tree', '--no-commit-id', '--numstat', '-r', '--no-renames', '--root', sha]).split('\n').filter(Boolean)) {
    const [added, deleted, ...path] = line.split('\t')
    numstat.set(path.join('\t'), {
      added: added === '-' ? 0 : Number(added),
      deleted: deleted === '-' ? 0 : Number(deleted),
      binary: added === '-',
    })
  }

  const files = status.slice(0, FILE_LIMIT).map(({ status: code, path }) => {
    const counts = numstat.get(path) ?? { added: 0, deleted: 0, binary: false }
    return { path, status: code, added: counts.added, deleted: counts.deleted, binary: counts.binary }
  })

  return {
    message,
    author: { name: people[0], email: people[1] },
    committer: { name: people[2], email: people[3] },
    committedAt: people[4],
    files,
    filesTruncated: status.length > FILE_LIMIT,
    diff: pickDiff(sha, files),
  }
}

/** The real patch for the smallest changed text file, capped for the page. */
function pickDiff(sha, files) {
  const candidates = files
    .filter((file) => !file.binary && file.status !== 'D' && file.added + file.deleted > 0)
    .sort((a, b) => a.added + a.deleted - (b.added + b.deleted))
  for (const file of candidates.slice(0, 8)) {
    const patch = git(['show', '--format=', '--no-color', '--unified=1', sha, '--', file.path], { allowFail: true })
    if (!patch) continue
    const lines = patch.split('\n')
    if (lines.length < 3) continue
    return { path: file.path, lines: lines.slice(0, DIFF_LIMIT), truncated: lines.length > DIFF_LIMIT }
  }
  return null
}
