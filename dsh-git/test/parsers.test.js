import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GitError,
  assertBranchName,
  assertCommitId,
  assertPathList,
  assertRelativePath,
  isBinaryPatch,
  parseBranches,
  parseLog,
  parseNameStatus,
  parseNumstat,
  parsePorcelainV2,
  parseRefs,
  presentChanges,
  truncatePatch,
} from '../git.js'

const FIELD = '\u001f'
const RECORD = '\u001e'

test('porcelain v2: branch headers and one modified entry', () => {
  const text = '# branch.oid 0f1e2d3c4b5a69788796a5b4c3d2e1f00a1b2c3d\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 aaaa bbbb src/app.js\u0000'
  const { branch, changes } = parsePorcelainV2(text)
  assert.equal(branch.oid, '0f1e2d3c4b5a69788796a5b4c3d2e1f00a1b2c3d')
  assert.equal(branch.head, 'main')
  assert.equal(branch.upstream, 'origin/main')
  assert.equal(branch.ahead, 2)
  assert.equal(branch.behind, 1)
  assert.equal(branch.detached, false)
  assert.equal(branch.unborn, false)
  assert.deepEqual(changes.staged, [])
  assert.deepEqual(changes.unstaged.map(entry => entry.path), ['src/app.js'])
  assert.equal(changes.unstaged[0].y, 'M')
})

test('porcelain v2: fully staged entry lands only in staged', () => {
  const text = '1 M. N... 100644 100644 100644 aaaa bbbb readme.md\u0000'
  const { changes } = parsePorcelainV2(text)
  assert.deepEqual(changes.staged.map(entry => entry.path), ['readme.md'])
  assert.deepEqual(changes.unstaged, [])
})

test('porcelain v2: a file staged and modified again appears in both groups', () => {
  const text = '1 MM N... 100644 100644 100644 aaaa bbbb both.js\u0000'
  const { changes } = parsePorcelainV2(text)
  assert.deepEqual(changes.staged.map(entry => entry.path), ['both.js'])
  assert.deepEqual(changes.unstaged.map(entry => entry.path), ['both.js'])
})

test('porcelain v2: NUL-terminated headers are accepted', () => {
  const text = '# branch.oid aaa\u0000# branch.head main\u0000# branch.ab +0 -0\u0000? new.txt\u0000'
  const { branch, changes } = parsePorcelainV2(text)
  assert.equal(branch.head, 'main')
  assert.deepEqual(changes.untracked.map(entry => entry.path), ['new.txt'])
})

test('porcelain v2: renames keep their original path', () => {
  const text = '2 R. N... 100644 100644 100644 aaaa bbbb R100 docs/new name.md\u0000docs/old name.md\u0000'
  const { changes } = parsePorcelainV2(text)
  assert.equal(changes.staged.length, 1)
  assert.equal(changes.staged[0].path, 'docs/new name.md')
  assert.equal(changes.staged[0].origPath, 'docs/old name.md')
  assert.equal(changes.staged[0].x, 'R')
})

test('porcelain v2: unmerged entries are reported as conflicts', () => {
  const text = 'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc both.txt\u0000'
  const { changes } = parsePorcelainV2(text)
  assert.deepEqual(changes.conflicted.map(entry => entry.path), ['both.txt'])
  assert.deepEqual(changes.staged, [])
  assert.deepEqual(changes.unstaged, [])
})

test('porcelain v2: unborn and detached heads', () => {
  const unborn = parsePorcelainV2('# branch.oid (initial)\n# branch.head main\n')
  assert.equal(unborn.branch.unborn, true)
  assert.equal(unborn.branch.oid, null)
  const detached = parsePorcelainV2('# branch.oid abc\n# branch.head (detached)\n')
  assert.equal(detached.branch.detached, true)
  assert.equal(detached.branch.head, '(detached)')
})

test('porcelain v2: empty and ignored entries', () => {
  assert.deepEqual(parsePorcelainV2('').changes.untracked, [])
  const ignored = parsePorcelainV2('! build/\u0000? kept.txt\u0000')
  assert.deepEqual(ignored.changes.untracked.map(entry => entry.path), ['kept.txt'])
})

test('presentChanges projects status letters', () => {
  const projected = presentChanges({
    staged: [{ path: 'a', x: 'A', y: '.', origPath: null }],
    unstaged: [{ path: 'b', x: '.', y: 'M', origPath: null }],
    untracked: [{ path: 'c', x: '?', y: '?', origPath: null }],
    conflicted: [{ path: 'd', x: '.', y: '.', origPath: null }],
  })
  assert.deepEqual(projected.staged, [{ path: 'a', origPath: null, status: 'A' }])
  assert.deepEqual(projected.unstaged, [{ path: 'b', origPath: null, status: 'M' }])
  assert.deepEqual(projected.untracked, [{ path: 'c', origPath: null, status: '?' }])
  assert.deepEqual(projected.conflicted, [{ path: 'd', origPath: null, status: 'U' }])
})

test('log parsing keeps parents, refs, and times', () => {
  const one = [
    'a'.repeat(40), 'aaaaaaa', 'b'.repeat(40), 'Ada', 'ada@example.com',
    '2026-11-05T10:00:00+08:00', '2026-11-05T10:05:00+08:00', 'feat: add graph',
    'HEAD -> main, origin/main, tag: v1.0.0',
  ].join(FIELD)
  const two = [
    'b'.repeat(40), 'bbbbbbb', '', 'Bob', 'bob@example.com',
    '2026-11-04T09:00:00+08:00', '2026-11-04T09:00:00+08:00', 'root commit', '',
  ].join(FIELD)
  const commits = parseLog(`${one}${RECORD}\n${two}${RECORD}`)
  assert.equal(commits.length, 2)
  assert.equal(commits[0].sha, 'a'.repeat(40))
  assert.equal(commits[0].short, 'aaaaaaa')
  assert.deepEqual(commits[0].parents, ['b'.repeat(40)])
  assert.equal(commits[0].subject, 'feat: add graph')
  assert.deepEqual(commits[0].refs, [
    { name: 'main', type: 'head', current: true },
    { name: 'origin/main', type: 'remote', current: false },
    { name: 'v1.0.0', type: 'tag', current: false },
  ])
  assert.deepEqual(commits[1].parents, [])
  assert.deepEqual(commits[1].refs, [])
  assert.equal(parseLog('').length, 0)
})

test('ref decoration parsing', () => {
  assert.deepEqual(parseRefs(''), [])
  assert.deepEqual(parseRefs('HEAD -> feat/x'), [{ name: 'feat/x', type: 'head', current: true }])
  assert.deepEqual(parseRefs('tag: v2'), [{ name: 'v2', type: 'tag', current: false }])
  assert.deepEqual(parseRefs('origin/main'), [{ name: 'origin/main', type: 'remote', current: false }])
  assert.deepEqual(parseRefs('HEAD'), [])
})

test('name-status and numstat parsing', () => {
  const rows = parseNameStatus('M\tsrc/a.js\nA\t"docs/new file.md"\nR100\told.js\tnew.js\n')
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { status: 'M', path: 'src/a.js', origPath: null })
  assert.deepEqual(rows[2], { status: 'R100', path: 'new.js', origPath: 'old.js' })

  const stats = parseNumstat('12\t3\tsrc/a.js\n-\t-\tassets/logo.png\n')
  assert.deepEqual(stats.get('src/a.js'), { additions: 12, deletions: 3 })
  assert.deepEqual(stats.get('assets/logo.png'), { additions: null, deletions: null })
})

test('branch parsing sorts nothing but drops remote HEAD', () => {
  const text = [
    `main${FIELD}refs/heads/main${FIELD}*${FIELD}origin/main${FIELD}2026-11-05T10:00:00+08:00`,
    `feat/x${FIELD}refs/heads/feat/x${FIELD} ${FIELD}${FIELD}2026-11-03T10:00:00+08:00`,
    `origin/main${FIELD}refs/remotes/origin/main${FIELD} ${FIELD}${FIELD}2026-11-05T10:00:00+08:00`,
    `origin/HEAD${FIELD}refs/remotes/origin/HEAD${FIELD} ${FIELD}${FIELD}`,
    `origin${FIELD}refs/remotes/origin/HEAD${FIELD} ${FIELD}${FIELD}`,
  ].join('\n')
  const branches = parseBranches(text)
  assert.equal(branches.length, 3)
  assert.deepEqual(branches[0], {
    name: 'main',
    refName: 'refs/heads/main',
    type: 'local',
    current: true,
    upstream: 'origin/main',
    commitTime: '2026-11-05T10:00:00+08:00',
  })
  assert.equal(branches[3], undefined)
})

test('relative paths are validated before a command is built', () => {
  assert.equal(assertRelativePath('src/a.js'), 'src/a.js')
  assert.equal(assertRelativePath('src/dir/file name.md'), 'src/dir/file name.md')
  // Any `..` segment is refused, including ones that would stay inside the tree:
  // normalizing them correctly is git's job, not a validator's.
  for (const bad of ['', '.', '/etc/passwd', 'C:\\x', 'a/../b', 'a\0b', '../x', 'a/b/../c']) {
    assert.throws(() => assertRelativePath(bad), error => error instanceof GitError && error.code === 'invalid_path', bad)
  }
  assert.throws(() => assertRelativePath(42), GitError)
  assert.throws(() => assertRelativePath('x'.repeat(5000)), GitError)
})

test('path lists are validated and de-duplicated', () => {
  assert.deepEqual(assertPathList('a.js'), ['a.js'])
  assert.deepEqual(assertPathList(['a.js', 'a.js', 'b.js']), ['a.js', 'b.js'])
  assert.throws(() => assertPathList([]), GitError)
  assert.throws(() => assertPathList(undefined), GitError)
  assert.throws(() => assertPathList(['/abs']), GitError)
})

test('commit ids are hexadecimal object names', () => {
  assert.equal(assertCommitId('ABCD1234'), 'abcd1234')
  assert.equal(assertCommitId('a'.repeat(40)), 'a'.repeat(40))
  for (const bad of ['', 'xyz', 'HEAD', 'abc', '-1']) {
    assert.throws(() => assertCommitId(bad), error => error.code === 'invalid_commit', bad)
  }
})

test('branch names are delegated to git when a runner is given', async () => {
  const calls = []
  const run = async args => {
    calls.push(args)
    if (args[1] === '--branch' && args[2] === 'bad name') throw new GitError('git_failed', 'refusing')
    return { stdout: '', stderr: '', code: 0 }
  }
  assert.equal(await assertBranchName(run, '/repo', ' feat/x '), 'feat/x')
  await assert.rejects(() => assertBranchName(run, '/repo', 'bad name'), error => error.code === 'invalid_branch')
  await assert.rejects(() => assertBranchName(run, '/repo', '-oops'), error => error.code === 'invalid_branch')
  await assert.rejects(() => assertBranchName(run, '/repo', '   '), error => error.code === 'invalid_branch')
  assert.deepEqual(calls[0], ['check-ref-format', '--branch', 'feat/x'])
})

test('binary patches are detected instead of rendered', () => {
  assert.equal(isBinaryPatch('diff --git a/x b/x\nBinary files a/x and b/x differ\n'), true)
  assert.equal(isBinaryPatch('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n'), false)
  assert.equal(isBinaryPatch(''), false)
  assert.equal(isBinaryPatch('abc\0def'), true)
})

test('patch truncation respects the byte budget and never splits a character', () => {
  const ascii = 'a'.repeat(100)
  assert.deepEqual(truncatePatch(ascii, 200), { patch: ascii, truncated: false, bytes: 100 })
  const cut = truncatePatch(ascii, 10)
  assert.equal(cut.truncated, true)
  assert.equal(cut.patch.length, 10)

  const multibyte = '中文字符'.repeat(10)
  const sliced = truncatePatch(multibyte, 7)
  assert.equal(sliced.truncated, true)
  assert.equal(sliced.patch.includes('\uFFFD'), false)
  assert.ok(Buffer.byteLength(sliced.patch, 'utf8') <= 7)
})
