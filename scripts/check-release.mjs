#!/usr/bin/env node
/**
 * Branch gate: every plugin's manifest version must already be tagged.
 *
 * Publishing is tag-triggered, so a version bumped in `package.json` without a
 * matching tag is a version that never reaches npm. Two such bumps in a row and
 * the registry skips numbers — exactly how dsh-git went 0.2.0 → 0.5.0 while
 * 0.3.0 and 0.4.0 lived only in the manifest.
 *
 * The rule, per package:
 *
 *   1. `package.json` declares `<version>`;
 *   2. a tag `<dir>-v<version>` exists;
 *   3. the tagged commit's `<dir>/package.json` declares that same version;
 *   4. the tagged commit is an ancestor of HEAD (so the tag is not stranded on
 *      an unmerged branch).
 *
 * Deliberately offline: publishing happens only from tags, so a tag already
 * implies the version will ship. Asking npm would make the gate depend on the
 * registry being reachable at push time.
 *
 *   node scripts/check-release.mjs                 # check this checkout
 *   node scripts/check-release.mjs --root <path>   # check another worktree
 *
 * Exit codes: 0 when every package is tagged, 1 when one is not, 2 on a bad
 * invocation. The workflow `.github/workflows/ci.yml` runs it on every push to
 * `release`.
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES, packageName, tagName } from './packages.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** Run git in `root`, returning trimmed stdout or throwing. */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** Run git for a value that may legitimately be absent. */
function tryGit(root, args) {
  try {
    return git(root, args)
  } catch {
    return null
  }
}

/** Run git for its exit status only. */
function gitOk(root, args) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('usage: node scripts/check-release.mjs [--root <path>]')
  process.exit(0)
}
const rootFlag = argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(here, '..') : resolve(argv[rootFlag + 1] ?? '')
if (rootFlag !== -1 && (argv[rootFlag + 1] === undefined || argv[rootFlag + 1].startsWith('-'))) {
  console.error('check-release: --root needs a directory')
  process.exit(2)
}

if (!gitOk(root, ['rev-parse', '--git-dir'])) {
  console.error(`check-release: ${root} is not a git checkout`)
  process.exit(2)
}

/** One line per package on success, a problem plus a fix per package otherwise. */
const notes = []
const problems = []

for (const dir of PACKAGES) {
  const manifestText = tryGit(root, ['show', `HEAD:${dir}/package.json`])
  let manifest
  try {
    manifest = JSON.parse(manifestText ?? '')
  } catch {
    problems.push(`${dir}/package.json is missing at HEAD; is ${dir} a plugin directory?`)
    continue
  }

  const name = packageName(dir, manifest)
  const version = manifest.version
  if (typeof version !== 'string' || version === '') {
    problems.push(`${dir}/package.json has no version string`)
    continue
  }

  const tag = tagName(dir, version)
  const commit = tryGit(root, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`])
  if (commit === null) {
    problems.push(
      `${name} declares ${version}, but no tag ${tag} exists — that version would never reach npm.`,
      `    fix: node scripts/release.mjs ${dir} --push      # tag HEAD and push branch + tag`,
      `    or:  revert the version change and commit that instead`,
    )
    continue
  }

  const short = commit.slice(0, 7)
  const taggedText = tryGit(root, ['show', `${commit}:${dir}/package.json`])
  let taggedVersion = null
  try {
    taggedVersion = JSON.parse(taggedText ?? '').version ?? null
  } catch {
    taggedVersion = null
  }
  if (taggedVersion !== version) {
    problems.push(
      `tag ${tag} points at ${short}, whose ${dir}/package.json declares ${taggedVersion ?? '(nothing)'} instead of ${version}.`,
      `    fix: delete the tag (git tag -d ${tag}) and recreate it on the commit that declares ${version}`,
    )
    continue
  }

  if (!gitOk(root, ['merge-base', '--is-ancestor', commit, 'HEAD'])) {
    problems.push(
      `tag ${tag} points at ${short}, which is not an ancestor of HEAD — it is stranded on another branch.`,
      `    fix: merge that branch into the release branch, then retag`,
    )
    continue
  }

  notes.push(`${name} ${version} → ${tag} at ${short}`)
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-release: ${problem}`)
  console.error(
    'check-release: a manifest version without a tag is a version users never see; tag it or revert it.',
  )
  process.exit(1)
}

for (const note of notes) console.log(`check-release: ${note}`)
console.log(`check-release: ${PACKAGES.length} package(s) tagged; every manifest version is releasable`)
