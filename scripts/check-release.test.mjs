/**
 * Tests for the branch gate in `check-release.mjs`.
 *
 * Each case builds a throwaway git repository, because the questions the gate
 * asks — does the tag exist, what does the tagged tree declare, is that commit
 * an ancestor of HEAD — are all properties of a history, not of a file. Running
 * these against the real repository would make the suite depend on which
 * versions happen to be released.
 *
 *   node --test scripts/
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-release.mjs')

/** Run git in `root` and return trimmed stdout. */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** A git repository with an identity, so commits work without global config. */
function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-release-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.test'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  git(root, ['config', 'tag.gpgsign', 'false'])
  return root
}

/** Write `<dir>/package.json` at `version` and commit it. */
function commitVersion(root, dir, version) {
  mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(
    join(root, dir, 'package.json'),
    `${JSON.stringify({ name: `@litingyes/${dir}`, version }, null, 2)}\n`,
  )
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', `${dir} ${version}`])
  return git(root, ['rev-parse', 'HEAD'])
}

/** A repository whose plugins are committed and tagged at HEAD. */
function taggedRepo(t, gitVersion = '0.5.1', context7Version = '0.2.1', directorVersion = '0.1.0') {
  const root = makeRepo(t)
  commitVersion(root, 'dsh-git', gitVersion)
  commitVersion(root, 'dsh-context7', context7Version)
  commitVersion(root, 'dsh-director', directorVersion)
  git(root, ['tag', '-a', `dsh-git-v${gitVersion}`, '-m', `release dsh-git ${gitVersion}`])
  git(root, ['tag', '-a', `dsh-context7-v${context7Version}`, '-m', `release dsh-context7 ${context7Version}`])
  git(root, ['tag', '-a', `dsh-director-v${directorVersion}`, '-m', `release dsh-director ${directorVersion}`])
  return root
}

/** Run the gate and return its exit code plus combined output. */
function check(root) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, output: stdout }
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

test('passes when every manifest version is tagged', (t) => {
  const root = taggedRepo(t)
  const result = check(root)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /dsh-git 0\.5\.1 → dsh-git-v0\.5\.1/)
  assert.match(result.output, /dsh-context7 0\.2\.1 → dsh-context7-v0\.2\.1/)
  assert.match(result.output, /dsh-director 0\.1\.0 → dsh-director-v0\.1\.0/)
})

test('fails when a version was bumped without a tag', (t) => {
  const root = taggedRepo(t)
  commitVersion(root, 'dsh-git', '0.5.2')

  const result = check(root)
  assert.equal(result.code, 1, 'a bump with no tag must fail the gate')
  assert.match(result.output, /declares 0\.5\.2, but no tag dsh-git-v0\.5\.2 exists/)
  assert.match(result.output, /scripts\/release\.mjs dsh-git --push/)
})

test('fails when the tag points at a commit declaring a different version', (t) => {
  const root = taggedRepo(t)
  const previous = git(root, ['rev-parse', 'HEAD'])
  commitVersion(root, 'dsh-git', '0.5.2')
  // The tag exists, but it was left on the 0.5.1 commit.
  git(root, ['tag', '-a', 'dsh-git-v0.5.2', '-m', 'wrong commit', previous])

  const result = check(root)
  assert.equal(result.code, 1)
  assert.match(result.output, /tag dsh-git-v0\.5\.2 points at \w+, whose dsh-git\/package\.json declares 0\.5\.1/)
})

test('fails when the tag is stranded on an unmerged branch', (t) => {
  const root = taggedRepo(t)
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])

  git(root, ['tag', '-d', 'dsh-git-v0.5.1'])
  git(root, ['checkout', '-q', '-b', 'side'])
  writeFileSync(join(root, 'side.txt'), 'side\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', 'side work'])
  git(root, ['tag', '-a', 'dsh-git-v0.5.1', '-m', 'tagged on the side branch'])
  git(root, ['checkout', '-q', branch])

  const result = check(root)
  assert.equal(result.code, 1)
  assert.match(result.output, /is not an ancestor of HEAD/)
})

test('rejects a directory that is not a git checkout', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-release-plain-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const result = check(root)
  assert.equal(result.code, 2)
  assert.match(result.output, /not a git checkout/)
})
