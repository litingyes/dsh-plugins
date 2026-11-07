#!/usr/bin/env node
/**
 * Create the tag that `.github/workflows/publish.yml` publishes from — and, with
 * `--bump`, do the whole release in one step.
 *
 *   node scripts/release.mjs dsh-git                        # tag an already-bumped manifest
 *   node scripts/release.mjs dsh-git --push                 # ...then push branch + tag
 *   node scripts/release.mjs dsh-git --bump patch           # bump, rebuild, commit, tag
 *   node scripts/release.mjs dsh-git --bump minor --push    # ...then push branch + tag
 *   node scripts/release.mjs dsh-git --bump patch --dry-run # print the plan, change nothing
 *
 * Why `--bump` exists: publishing is tag-triggered, so a version changed in a
 * feature commit and never tagged is a version users never see — dsh-git went
 * 0.2.0 → 0.5.0 that way, with 0.3.0 and 0.4.0 living only in the manifest.
 * Bumping and tagging in separate steps is what allowed it, so the script now
 * does both and `scripts/check-release.mjs` fails the branch if anyone goes back
 * to hand-editing the version.
 *
 * The tag is `<directory>-v<version>`, read from that package's `package.json`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES, tagName } from './packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Bump kinds accepted by `--bump`; `patch` is the default. */
const BUMPS = ['patch', 'minor', 'major']

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

/** Replace only the `version` value, so the manifest keeps its formatting. */
function writeVersion(file, version) {
  const text = readFileSync(file, 'utf8')
  const field = /("version":\s*")[^"]*(")/u
  if (!field.test(text)) fail(`could not find the version field in ${file}`)
  writeFileSync(file, text.replace(field, `$1${version}$2`))
}

/** Next version for one bump kind; a prerelease suffix is dropped. */
function bumpVersion(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(version)
  if (match === null) fail(`cannot bump ${version}: expected major.minor.patch`)
  let major = Number(match[1])
  let minor = Number(match[2])
  let patch = Number(match[3])
  if (kind === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (kind === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}

/* --------------------------------------------------------------- arguments */

const argv = process.argv.slice(2)
const push = argv.includes('--push')
const dryRun = argv.includes('--dry-run')

let bump = null
let dir = null
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index]
  if (argument === '--push' || argument === '--dry-run') continue
  if (argument === '--bump') {
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('-') && BUMPS.includes(next)) {
      bump = next
      index += 1
    } else if (next !== undefined && !next.startsWith('-')) {
      fail(`unknown bump "${next}"; expected one of ${BUMPS.join(', ')}`)
    } else {
      bump = 'patch'
    }
    continue
  }
  if (argument.startsWith('-')) fail(`unknown flag ${argument}`)
  if (dir !== null) fail(`unexpected argument ${argument}`)
  dir = argument
}

if (dir === undefined || dir === null || !PACKAGES.includes(dir)) {
  console.error(`usage: node scripts/release.mjs <${PACKAGES.join('|')}> [--bump ${BUMPS.join('|')}] [--push] [--dry-run]`)
  process.exit(2)
}

/* ------------------------------------------------------------ preconditions */

const manifestPath = join(root, dir, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const currentVersion = manifest.version
const packageName = typeof manifest.name === 'string' ? manifest.name : dir

const dirty = git(['status', '--porcelain'])
if (dirty !== '') {
  fail(`working tree is not clean; commit or stash first:\n${dirty}`)
}

let branch
try {
  branch = git(['symbolic-ref', '--short', 'HEAD'])
} catch {
  fail('HEAD is detached; check out the branch the release belongs to')
}

const version = bump === null ? currentVersion : bumpVersion(currentVersion, bump)
const tag = tagName(dir, version)

let tagExists = true
try {
  git(['rev-parse', '--verify', `refs/tags/${tag}`])
} catch {
  tagExists = false
}
if (tagExists) {
  fail(`tag ${tag} already exists; bump ${dir}/package.json or delete that tag first`)
}

/* -------------------------------------------------------------------- plan */

/** READMEs that pin the released version in their install command (repo-relative, forward slashes). */
const pinFiles = ['README.md', `${dir}/README.md`, `${dir}/README.en.md`].filter((file) =>
  existsSync(join(root, file)),
)

const hasBuild = typeof manifest.scripts?.build === 'string'
const steps = []
if (bump !== null) {
  steps.push(`set ${dir}/package.json to ${version} (${bump} from ${currentVersion})`)
  if (hasBuild) steps.push(`rebuild ${dir} with its build script (the bundle banner carries the version)`)
  steps.push(`rewrite the install pins in ${pinFiles.join(', ')}`)
  steps.push(`commit "release: ${dir} ${version}"`)
}
steps.push(`create annotated tag ${tag} on HEAD`)
if (push) steps.push(`push ${branch} and ${tag} to origin`)
else steps.push('leave the tag local (rerun with --push to publish)')

if (dryRun) {
  console.log(`release: would release ${packageName}@${version} from ${git(['rev-parse', '--short', 'HEAD'])}:`)
  for (const step of steps) console.log(`release:   - ${step}`)
  console.log('release: dry run; nothing was written')
  process.exit(0)
}

/* -------------------------------------------------------------- bump commit */

if (bump !== null) {
  writeVersion(manifestPath, version)

  if (hasBuild) {
    // The build script is a command line (`node scripts/build-client.mjs`), not a
    // path, so run it the way a shell would instead of guessing at a filename.
    const [runner, ...buildArgs] = manifest.scripts.build.trim().split(/\s+/u)
    try {
      execFileSync(runner, buildArgs, { cwd: join(root, dir), stdio: 'inherit' })
    } catch {
      git(['checkout', '--', `${dir}/package.json`])
      fail(`the ${dir} build failed; nothing was committed and ${dir}/package.json is restored`)
    }
  }

  for (const file of pinFiles) {
    const path = join(root, file)
    const text = readFileSync(path, 'utf8')
    const pinned = `${packageName}@${currentVersion}`
    if (!text.includes(pinned)) continue
    writeFileSync(path, text.split(pinned).join(`${packageName}@${version}`))
  }

  // Stage exactly the files this script owns. Parsing `git status --porcelain`
  // here would be wrong: its first line starts with a space that `git()` trims,
  // and the working tree is known-clean, so the set below is the whole change.
  const touched = [...pinFiles, `${dir}/package.json`]
  if (hasBuild) touched.push(`${dir}/client.js`)
  git(['add', '--', ...touched])
  git(['commit', '-q', '-m', `release: ${dir} ${version}`])
  console.log(`release: committed ${version} (${touched.join(', ')})`)
}

/* --------------------------------------------------------------------- tag */

const head = git(['rev-parse', '--short', 'HEAD'])
git(['tag', '-a', tag, '-m', `release ${packageName}@${version}`])
console.log(`release: created ${tag} at ${head} (${packageName}@${version})`)

/* -------------------------------------------------------------------- push */

const pushArgs = ['push', 'origin', branch, `refs/tags/${tag}`]

if (push) {
  console.log(`release: pushing ${branch} and ${tag}...`)
  execFileSync('git', pushArgs, { cwd: root, stdio: 'inherit' })
  console.log(
    `release: pushed; the Publish to npm workflow now handles ${packageName}@${version} ` +
      '(and skips it when the version is already on npm)',
  )
} else {
  console.log(`release: next, run:\n  git ${pushArgs.join(' ')}`)
}

console.log(
  'release: after the tag lands, run `cd site && pnpm sync` and commit site/src/data/*.json ' +
    '(the portal graph and plugin versions come from those files)',
)
