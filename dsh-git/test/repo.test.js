import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GitError, createGitService } from '../git.js'

/** Run git synchronously for fixture setup. */
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    // Some fixtures leave a merge or rebase deliberately stopped; git explains
    // that on stderr, which is expected here and would only noise the run.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  })
}

/** Create a throwaway repository, removed when the test ends. */
function makeRepo(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-git-repo-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test User')
  return dir
}

/** A service bound to exactly one fake workspace. */
function serviceFor(dir, config = {}) {
  return createGitService({
    workspaces: () => [{ id: 'w1', title: 'fixture', path: dir }],
    config: { commandTimeoutMs: 20000, ...config },
  })
}

/** Write one file and commit it through the service. */
async function commitFile(service, dir, name, message = name) {
  writeFileSync(path.join(dir, name), `${message}\n`)
  return service.commit({ message, paths: [name] })
}

test('an empty repository reports itself without failing', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  const state = await service.state({})
  assert.equal(state.repo.isRepo, true)
  assert.equal(state.isEmpty, true)
  assert.equal(state.repo.isEmpty, true)
  assert.deepEqual(state.commits, [])
  assert.equal(state.branch.unborn, true)
  assert.deepEqual(state.changes.untracked, [])
  assert.deepEqual(state.branches, [])
  assert.equal(state.workspace.id, 'w1')
  assert.equal(state.workspaces.length, 1)
})

test('a directory outside any repository reports not_a_repo', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-git-plain-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const state = await serviceFor(dir).state({})
  assert.equal(state.repo.isRepo, false)
  assert.equal(state.repo.reason, 'not_a_repo')
  assert.deepEqual(state.commits, [])
})

test('an unknown workspace id is refused', async t => {
  const service = serviceFor(makeRepo(t))
  await assert.rejects(
    () => service.state({ workspaceId: 'nope' }),
    error => error instanceof GitError && error.code === 'unknown_workspace',
  )
})

test('a Session directory selects the workspace that contains it', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')

  const exact = await service.state({ dir })
  assert.equal(exact.workspace.id, 'w1')
  assert.equal(exact.repo.isRepo, true)

  // A trailing separator and a nested directory both resolve to the same
  // registration; the git commands still run in the registered root.
  const trailing = await service.state({ dir: `${dir}/` })
  assert.equal(trailing.workspace.id, 'w1')

  const nested = path.join(dir, 'sub', 'deeper')
  mkdirSync(nested, { recursive: true })
  const inside = await service.state({ dir: nested })
  assert.equal(inside.workspace.id, 'w1')
  assert.equal(inside.repo.isRepo, true)
})

test('a directory outside every registered workspace is refused', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  const outside = mkdtempSync(path.join(tmpdir(), 'dsh-git-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))

  await assert.rejects(
    () => service.state({ dir: outside }),
    error => error instanceof GitError && error.code === 'outside_workspace',
  )
  // A sibling whose name merely shares the prefix is outside too.
  await assert.rejects(
    () => service.state({ dir: `${dir}-sibling` }),
    error => error instanceof GitError && error.code === 'outside_workspace',
  )
})

test('no directory and no id resolves to the registry order', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  const state = await service.state({ dir: '' })
  assert.equal(state.workspace.id, 'w1')
})

test('stage, diff, and commit round-trip', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)

  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  let state = await service.state({})
  assert.deepEqual(state.changes.untracked.map(entry => `${entry.status}:${entry.path}`), ['?:a.txt'])

  await service.stage({ paths: ['a.txt'] })
  state = await service.state({})
  assert.deepEqual(state.changes.staged.map(entry => entry.path), ['a.txt'])
  assert.deepEqual(state.changes.untracked, [])

  const patch = await service.diff({ target: 'index', path: 'a.txt' })
  assert.match(patch.patch, /\+one/u)
  assert.equal(patch.binary, false)

  const commit = await service.commit({ message: 'feat: add a', paths: ['a.txt'] })
  assert.match(commit.sha, /^[0-9a-f]{40}$/u)
  assert.equal(commit.summary, 'feat: add a')

  state = await service.state({})
  assert.equal(state.isEmpty, false)
  assert.equal(state.branch.head, 'main')
  assert.equal(state.changes.staged.length, 0)
  assert.equal(state.commits.length, 1)
  assert.equal(state.commits[0].subject, 'feat: add a')
  assert.equal(state.branches.length, 1)
  assert.equal(state.branches[0].current, true)
})

test('working-tree diff shows unstaged edits and honours the byte cap', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir, { maxDiffBytes: 60 })
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  writeFileSync(path.join(dir, 'a.txt'), `${'two\n'.repeat(80)}`)
  const patch = await service.diff({ target: 'worktree', path: 'a.txt' })
  assert.equal(patch.truncated, true)
  assert.ok(patch.bytes > 60)
  assert.ok(Buffer.byteLength(patch.patch, 'utf8') <= 60)
})

test('commit detail lists changed files with stats', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  const first = await service.commit({ message: 'first', paths: ['a.txt'] })

  writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n')
  writeFileSync(path.join(dir, 'b.txt'), 'new\n')
  await service.commit({ message: 'second\n\nwith a body', paths: ['a.txt', 'b.txt'] })

  const head = git(dir, 'rev-parse', 'HEAD').trim()
  const detail = await service.commitDetail({ commit: head })
  assert.equal(detail.author, 'Test User')
  assert.equal(detail.email, 'test@example.com')
  assert.match(detail.message, /^second\n\nwith a body/u)
  assert.deepEqual(detail.files.map(file => file.path).sort(), ['a.txt', 'b.txt'])
  const a = detail.files.find(file => file.path === 'a.txt')
  assert.equal(a.additions, 1)
  assert.equal(a.deletions, 0)

  const inCommit = await service.diff({ target: 'commit', commit: head, path: 'b.txt' })
  assert.match(inCommit.patch, /\+new/u)

  const older = await service.commitDetail({ commit: first.sha })
  assert.deepEqual(older.files.map(file => file.path), ['a.txt'])
})

test('branch creation and switching', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  await service.createBranch({ branch: 'feat/panel' })
  let state = await service.state({})
  assert.equal(state.branch.head, 'feat/panel')

  await service.checkout({ branch: 'main' })
  state = await service.state({})
  assert.equal(state.branch.head, 'main')

  await assert.rejects(() => service.checkout({ branch: 'missing' }), error => error.code === 'unknown_branch')
  await assert.rejects(() => service.createBranch({ branch: 'main' }), error => error.code === 'branch_exists')
  await assert.rejects(() => service.createBranch({ branch: 'bad..name' }), error => error.code === 'invalid_branch')
})

test('unstage returns a staged file to the working tree', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  writeFileSync(path.join(dir, 'a.txt'), 'two\n')
  await service.stage({ paths: ['a.txt'] })
  await service.unstage({ paths: ['a.txt'] })
  const state = await service.state({})
  assert.deepEqual(state.changes.staged, [])
  assert.deepEqual(state.changes.unstaged.map(entry => entry.path), ['a.txt'])
})

test('discard needs confirmation, then restores tracked files and removes untracked ones', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  writeFileSync(path.join(dir, 'a.txt'), 'changed\n')
  writeFileSync(path.join(dir, 'stray.txt'), 'stray\n')

  await assert.rejects(
    () => service.discard({ paths: ['a.txt'] }),
    error => error.code === 'confirm_required',
  )

  const result = await service.discard({ paths: ['a.txt', 'stray.txt'], confirm: true })
  assert.deepEqual(result.discarded, ['a.txt'])
  assert.deepEqual(result.removed, ['stray.txt'])
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'one\n')
  assert.equal(existsSync(path.join(dir, 'stray.txt')), false)
})

test('discard refuses a path that is not currently changed', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })
  await assert.rejects(
    () => service.discard({ paths: ['a.txt'], confirm: true }),
    error => error.code === 'unknown_path',
  )
})

test('commit refuses an empty message and unknown paths are still validated', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await assert.rejects(() => service.commit({ message: '   ' }), error => error.code === 'invalid_message')
  await assert.rejects(() => service.commit({ message: 'x', paths: ['../escape'] }), error => error.code === 'invalid_path')
  await assert.rejects(() => service.diff({ target: 'worktree', path: '/etc/passwd' }), error => error.code === 'invalid_path')
})

test('commit on an empty index surfaces git\u2019s own message', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await assert.rejects(
    () => service.commit({ message: 'nothing here' }),
    error => error instanceof GitError && error.code === 'git_failed',
  )
})

test('detached HEAD is reported as such', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  const first = await service.commit({ message: 'init', paths: ['a.txt'] })
  git(dir, 'checkout', '-q', first.sha)
  const state = await service.state({})
  assert.equal(state.branch.detached, true)
  assert.equal(state.branch.head, '(detached)')
})

test('a merge commit detail does not fail and still lists files', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'base.txt'), 'base\n')
  await service.commit({ message: 'base', paths: ['base.txt'] })

  await service.createBranch({ branch: 'side' })
  writeFileSync(path.join(dir, 'side.txt'), 'side\n')
  await service.commit({ message: 'side', paths: ['side.txt'] })

  await service.checkout({ branch: 'main' })
  writeFileSync(path.join(dir, 'main.txt'), 'main\n')
  await service.commit({ message: 'main', paths: ['main.txt'] })

  git(dir, 'merge', '--no-ff', '-m', 'merge side', 'side')
  const head = git(dir, 'rev-parse', 'HEAD').trim()
  const detail = await service.commitDetail({ commit: head })
  assert.equal(detail.parents.length, 2)
  assert.ok(detail.files.length > 0)

  const state = await service.state({ refs: 'all' })
  const layoutInput = state.commits
  assert.ok(layoutInput.length >= 4)
  const mergeRow = layoutInput.find(commit => commit.sha === head)
  assert.equal(mergeRow.parents.length, 2)
})

/* ------------------------------------------------------------------ *
 * Worktrees
 * ------------------------------------------------------------------ */

/** A directory outside the repository, so a fixture stays free of side effects. */
function outsideDir(t) {
  const parent = mkdtempSync(path.join(tmpdir(), 'dsh-git-wt-'))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  return parent
}

test('a snapshot lists the repository worktrees and marks its own', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const state = await service.state({})
  assert.equal(state.worktrees.length, 1)
  const [main] = state.worktrees
  assert.equal(main.current, true)
  assert.equal(main.main, true)
  assert.equal(main.branch, 'main')
  assert.equal(main.displayPath, '.')
  assert.equal(main.detached, false)
  assert.equal(main.bare, false)
  assert.equal(main.locked, null)
  assert.equal(main.prunable, null)
  assert.match(main.head, /^[0-9a-f]{7}$/u)
  assert.equal(state.worktree.path, main.path)

  // The branch row knows the worktree that holds it, and that it is this one.
  const current = state.branches.find(branch => branch.name === 'main')
  assert.equal(current.worktreePath, main.path)
  assert.equal(current.worktreeCurrent, true)
})

test('a branch checked out elsewhere is annotated and cannot be switched to', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const linked = path.join(outsideDir(t), 'tree')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/linked', linked)

  const state = await service.state({})
  assert.equal(state.worktrees.length, 2)
  const row = state.worktrees.find(entry => entry.branch === 'feat/linked')
  assert.equal(row.current, false)
  assert.equal(row.main, false)
  assert.ok(row.path.endsWith(`${path.sep}tree`))

  const branch = state.branches.find(entry => entry.name === 'feat/linked')
  assert.ok(branch !== undefined)
  assert.equal(branch.worktreeCurrent, false)
  assert.equal(branch.worktreePath, row.path)

  // git itself would refuse after the fact; the service refuses before it runs.
  await assert.rejects(
    () => service.checkout({ branch: 'feat/linked' }),
    error => error instanceof GitError && error.code === 'branch_in_worktree' && error.detail.path === row.path,
  )
  // The branch this worktree already has checked out is still switchable.
  assert.deepEqual(await service.checkout({ branch: 'main' }), { branch: 'main' })
})

test('creating a worktree registers it and leaves the status clean', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const created = await service.createWorktree({ branch: 'feat/new', createBranch: true })
  assert.equal(created.branch, 'feat/new')
  assert.equal(existsSync(created.path), true)
  assert.ok(created.path.endsWith(path.join('.agents', 'worktrees', 'feat', 'new')))

  // The container is ignored, so a fresh worktree is not a change of its own.
  const marker = path.join(dir, '.agents', 'worktrees', '.gitignore')
  assert.equal(readFileSync(marker, 'utf8').trim(), '*')
  let state = await service.state({})
  assert.equal(state.worktrees.length, 2)
  assert.deepEqual(state.changes, { staged: [], unstaged: [], untracked: [], conflicted: [] })

  // The same branch cannot be registered twice, and may not escape the workspace.
  await assert.rejects(
    () => service.createWorktree({ branch: 'feat/new', createBranch: true }),
    error => error.code === 'worktree_exists' || error.code === 'branch_exists',
  )
  await assert.rejects(
    () => service.createWorktree({ branch: 'feat/other', createBranch: true, path: '../outside' }),
    error => error.code === 'invalid_worktree_path',
  )
  await assert.rejects(
    () => service.createWorktree({ branch: 'feat/other', createBranch: true, path: '.git/tree' }),
    error => error.code === 'invalid_worktree_path',
  )
  await assert.rejects(
    () => service.createWorktree({ branch: 'ghost' }),
    error => error.code === 'unknown_branch',
  )

  // A branch that already exists is moved into a worktree, not recreated.
  git(dir, 'branch', 'feat/old')
  const moved = await service.createWorktree({ branch: 'feat/old' })
  assert.equal(existsSync(moved.path), true)
  await assert.rejects(
    () => service.createWorktree({ branch: 'feat/old', path: 'another' }),
    error => error.code === 'branch_in_worktree',
  )

  state = await service.state({})
  assert.equal(state.worktrees.length, 3)
})

test('removing a worktree needs confirmation and never touches the main one', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const created = await service.createWorktree({ branch: 'feat/gone', createBranch: true })
  await assert.rejects(
    () => service.removeWorktree({ path: created.path }),
    error => error.code === 'confirm_required',
  )
  await assert.rejects(
    () => service.removeWorktree({ path: dir, confirm: true }),
    error => error.code === 'worktree_in_use',
  )
  await assert.rejects(
    () => service.removeWorktree({ path: path.join(dir, 'nope'), confirm: true }),
    error => error.code === 'unknown_worktree',
  )

  await service.removeWorktree({ path: created.path, confirm: true })
  assert.equal(existsSync(created.path), false)
  assert.equal((await service.state({})).worktrees.length, 1)
})

test('a dirty worktree survives a plain removal and goes with force', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const created = await service.createWorktree({ branch: 'feat/dirty', createBranch: true })
  writeFileSync(path.join(created.path, 'dirty.txt'), 'unsaved\n')

  await assert.rejects(
    () => service.removeWorktree({ path: created.path, confirm: true }),
    error => error instanceof GitError && error.code === 'git_failed',
  )
  await service.removeWorktree({ path: created.path, confirm: true, force: true })
  assert.equal(existsSync(created.path), false)
})

test('prune forgets a worktree whose directory disappeared', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  await service.commit({ message: 'init', paths: ['a.txt'] })

  const created = await service.createWorktree({ branch: 'feat/lost', createBranch: true })
  rmSync(created.path, { recursive: true, force: true })

  let state = await service.state({})
  const lost = state.worktrees.find(entry => entry.branch === 'feat/lost')
  assert.ok(lost !== undefined)
  assert.notEqual(lost.prunable, null)

  assert.deepEqual(await service.pruneWorktrees({}), { pruned: true })
  state = await service.state({})
  assert.equal(state.worktrees.length, 1)
  // Pruning forgets the registration, never the branch.
  assert.ok(state.branches.some(entry => entry.name === 'feat/lost'))
})

/* ------------------------------------------------------------------ *
 * History actions: merge, rebase, cherry-pick, revert, drop
 * ------------------------------------------------------------------ */

test('merge fast-forwards a local branch and a remote-tracking ref', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')

  git(dir, 'checkout', '-q', '-b', 'side')
  await commitFile(service, dir, 'side.txt', 'side')
  git(dir, 'checkout', '-q', 'main')

  assert.deepEqual(await service.merge({ branch: 'side', type: 'local' }), { branch: 'side' })
  let state = await service.state({})
  assert.equal(state.branch.head, 'main')
  assert.ok(state.commits.some(commit => commit.subject === 'side'))
  assert.equal(readFileSync(path.join(dir, 'side.txt'), 'utf8'), 'side\n')

  // A remote-tracking ref is a merge target too; the full ref name reaches git.
  git(dir, 'checkout', '-q', '-b', 'remote-work')
  await commitFile(service, dir, 'remote.txt', 'remote-work')
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'update-ref', 'refs/remotes/origin/remote-work', git(dir, 'rev-parse', 'remote-work').trim())
  assert.deepEqual(
    await service.merge({ branch: 'origin/remote-work', type: 'remote' }),
    { branch: 'origin/remote-work' },
  )
  assert.equal(existsSync(path.join(dir, 'remote.txt')), true)

  // The checked-out branch cannot merge into itself, and an unknown name is a
  // caller error rather than a git failure.
  await assert.rejects(
    () => service.merge({ branch: 'main', type: 'local' }),
    error => error instanceof GitError && error.code === 'same_branch',
  )
  await assert.rejects(
    () => service.merge({ branch: 'ghost' }),
    error => error instanceof GitError && error.code === 'unknown_branch',
  )
})

test('a merge conflict is aborted and reported as merge_conflict', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'base')
  git(dir, 'checkout', '-q', '-b', 'side')
  await commitFile(service, dir, 'a.txt', 'side')
  git(dir, 'checkout', '-q', 'main')
  await commitFile(service, dir, 'a.txt', 'main')

  await assert.rejects(
    () => service.merge({ branch: 'side', type: 'local' }),
    error => error instanceof GitError && error.code === 'merge_conflict' && error.detail.branch === 'side',
  )
  // The panel cannot resolve conflicts, so the stopped merge must be gone.
  assert.equal(existsSync(path.join(dir, '.git', 'MERGE_HEAD')), false)
  const state = await service.state({})
  assert.equal(state.repo.operation, null)
  assert.deepEqual(state.changes, { staged: [], unstaged: [], untracked: [], conflicted: [] })
})

test('rebase replays the current branch onto the target and aborts on conflict', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'base.txt', 'base')
  git(dir, 'checkout', '-q', '-b', 'target')
  await commitFile(service, dir, 'target.txt', 'target')
  git(dir, 'checkout', '-q', 'main')
  await commitFile(service, dir, 'main.txt', 'main')

  assert.deepEqual(await service.rebase({ branch: 'target', type: 'local' }), { branch: 'target' })
  const log = git(dir, 'log', '--format=%s', '-3').trim().split('\n')
  assert.deepEqual(log, ['main', 'target', 'base'])
  assert.doesNotThrow(() => git(dir, 'merge-base', '--is-ancestor', 'target', 'HEAD'))

  // A later commit on the current branch that conflicts with the new base.
  git(dir, 'checkout', '-q', '-b', 'conflicting', 'target')
  await commitFile(service, dir, 'main.txt', 'conflicting')
  git(dir, 'checkout', '-q', 'main')
  const headBefore = (await service.state({})).branch.oid
  await assert.rejects(
    () => service.rebase({ branch: 'conflicting', type: 'local' }),
    error => error instanceof GitError && error.code === 'rebase_conflict',
  )
  assert.equal(existsSync(path.join(dir, '.git', 'rebase-merge')), false)
  const state = await service.state({})
  assert.equal(state.branch.head, 'main')
  assert.equal(state.branch.oid, headBefore)
  assert.equal(state.repo.operation, null)
})

test('cherry-pick applies one commit and refuses HEAD or a merge commit', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')
  git(dir, 'checkout', '-q', '-b', 'work')
  const picked = await commitFile(service, dir, 'picked.txt', 'picked')
  git(dir, 'checkout', '-q', 'main')

  assert.deepEqual(await service.cherryPick({ commit: picked.sha }), { commit: picked.sha })
  assert.equal(readFileSync(path.join(dir, 'picked.txt'), 'utf8'), 'picked\n')
  assert.equal((await service.state({})).commits[0].subject, 'picked')

  const head = (await service.state({})).branch.oid
  await assert.rejects(
    () => service.cherryPick({ commit: head }),
    error => error instanceof GitError && error.code === 'same_commit',
  )
  await assert.rejects(
    () => service.cherryPick({ commit: '0123456789abcdef' }),
    error => error instanceof GitError && error.code === 'unknown_commit',
  )

  // A merge commit has no single patch to pick without a mainline.
  git(dir, 'checkout', '-q', '-b', 'merged', 'HEAD~1')
  await commitFile(service, dir, 'merged.txt', 'merged')
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'merged')
  const mergeCommit = git(dir, 'rev-parse', 'HEAD').trim()
  await assert.rejects(
    () => service.cherryPick({ commit: mergeCommit }),
    error => error instanceof GitError && error.code === 'merge_commit',
  )
})

test('a cherry-pick conflict is aborted and reported', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'base')
  git(dir, 'checkout', '-q', '-b', 'work')
  await commitFile(service, dir, 'a.txt', 'work')
  git(dir, 'checkout', '-q', 'main')
  await commitFile(service, dir, 'a.txt', 'main')
  const work = git(dir, 'rev-parse', 'work').trim()

  await assert.rejects(
    () => service.cherryPick({ commit: work }),
    error => error instanceof GitError && error.code === 'cherry_pick_conflict',
  )
  assert.equal(existsSync(path.join(dir, '.git', 'CHERRY_PICK_HEAD')), false)
  assert.equal((await service.state({})).repo.operation, null)
})

test('revert undoes a commit and refuses non-ancestors', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'first')
  const second = await commitFile(service, dir, 'a.txt', 'second')

  assert.deepEqual(await service.revert({ commit: second.sha }), { commit: second.sha })
  assert.equal(readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'first\n')
  // `git revert --no-edit` keeps git's own message, so the newest commit is the
  // revert of the one that was asked for.
  assert.match((await service.state({})).commits[0].subject, /^Revert "second"/u)

  // A commit that only exists on another branch is not this branch's history.
  git(dir, 'checkout', '-q', '-b', 'elsewhere')
  const stranger = await commitFile(service, dir, 'other.txt', 'other')
  git(dir, 'checkout', '-q', 'main')
  await assert.rejects(
    () => service.revert({ commit: stranger.sha }),
    error => error instanceof GitError && error.code === 'not_ancestor',
  )
})

test('a revert conflict is aborted and reported', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  const first = await commitFile(service, dir, 'a.txt', 'one')
  await commitFile(service, dir, 'a.txt', 'two')

  await assert.rejects(
    () => service.revert({ commit: first.sha }),
    error => error instanceof GitError && error.code === 'revert_conflict',
  )
  assert.equal(existsSync(path.join(dir, '.git', 'REVERT_HEAD')), false)
  assert.equal((await service.state({})).repo.operation, null)
})

test('dropping one commit keeps its descendants', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')
  const middle = await commitFile(service, dir, 'b.txt', 'b')
  await commitFile(service, dir, 'c.txt', 'c')

  assert.deepEqual(await service.dropCommit({ commit: middle.sha, confirm: true }), {
    commit: middle.sha,
    dropped: true,
  })
  assert.deepEqual(
    git(dir, 'log', '--format=%s').trim().split('\n'),
    ['c', 'a'],
  )
  assert.equal(existsSync(path.join(dir, 'b.txt')), false)
  assert.equal(existsSync(path.join(dir, 'c.txt')), true)
  assert.equal((await service.state({})).repo.operation, null)
})

test('dropping the tip removes only that commit', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')
  const tip = await commitFile(service, dir, 'b.txt', 'b')

  await service.dropCommit({ commit: tip.sha, confirm: true })
  assert.deepEqual(git(dir, 'log', '--format=%s').trim().split('\n'), ['a'])
})

test('drop refuses a root commit, a merge commit, a stranger, and unconfirmed work', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  const root = await commitFile(service, dir, 'a.txt', 'a')
  const middle = await commitFile(service, dir, 'b.txt', 'b')
  await commitFile(service, dir, 'c.txt', 'c')

  await assert.rejects(
    () => service.dropCommit({ commit: middle.sha }),
    error => error instanceof GitError && error.code === 'confirm_required',
  )
  await assert.rejects(
    () => service.dropCommit({ commit: root.sha, confirm: true }),
    error => error instanceof GitError && error.code === 'root_commit',
  )
  await assert.rejects(
    () => service.dropCommit({ commit: 'deadbeef', confirm: true }),
    error => error instanceof GitError && error.code === 'unknown_commit',
  )

  // A merge commit cannot be dropped as "one commit" without choosing a side.
  git(dir, 'checkout', '-q', '-b', 'merged', 'HEAD~1')
  await commitFile(service, dir, 'merged.txt', 'merged')
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'merged')
  const mergeCommit = git(dir, 'rev-parse', 'HEAD').trim()
  await assert.rejects(
    () => service.dropCommit({ commit: mergeCommit, confirm: true }),
    error => error instanceof GitError && error.code === 'merge_commit',
  )

  // A commit reachable only from another branch is not on this history.
  git(dir, 'checkout', '-q', '-b', 'elsewhere')
  const stranger = await commitFile(service, dir, 'other.txt', 'other')
  git(dir, 'checkout', '-q', 'main')
  await assert.rejects(
    () => service.dropCommit({ commit: stranger.sha, confirm: true }),
    error => error instanceof GitError && error.code === 'not_ancestor',
  )
})

test('drop refuses a range that would rewrite merge commits', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')
  const middle = await commitFile(service, dir, 'b.txt', 'b')
  await commitFile(service, dir, 'c.txt', 'c')

  git(dir, 'checkout', '-q', '-b', 'side', 'HEAD~2')
  await commitFile(service, dir, 'side.txt', 'side')
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'side')

  await assert.rejects(
    () => service.dropCommit({ commit: middle.sha, confirm: true }),
    error => error instanceof GitError && error.code === 'merges_in_range',
  )
})

test('history actions refuse a dirty tracked worktree', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'a')
  git(dir, 'branch', 'side')
  const head = (await service.state({})).branch.oid
  writeFileSync(path.join(dir, 'a.txt'), 'dirty\n')

  await assert.rejects(
    () => service.merge({ branch: 'side', type: 'local' }),
    error => error instanceof GitError && error.code === 'worktree_dirty',
  )
  await assert.rejects(
    () => service.cherryPick({ commit: head }),
    error => error instanceof GitError && error.code === 'worktree_dirty',
  )
  await assert.rejects(
    () => service.dropCommit({ commit: head, confirm: true }),
    error => error instanceof GitError && error.code === 'worktree_dirty',
  )
})

test('history actions refuse a detached HEAD and an empty repository', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await assert.rejects(
    () => service.merge({ branch: 'side' }),
    error => error instanceof GitError && error.code === 'no_commit',
  )

  await commitFile(service, dir, 'a.txt', 'a')
  git(dir, 'checkout', '-q', '--detach', 'HEAD')
  const head = (await service.state({})).branch.oid
  await assert.rejects(
    () => service.merge({ branch: 'main', type: 'local' }),
    error => error instanceof GitError && error.code === 'detached_head',
  )
  await assert.rejects(
    () => service.dropCommit({ commit: head, confirm: true }),
    error => error instanceof GitError && error.code === 'detached_head',
  )
})

test('a stopped operation is reported in the snapshot and blocks history actions', async t => {
  const dir = makeRepo(t)
  const service = serviceFor(dir)
  await commitFile(service, dir, 'a.txt', 'base')
  git(dir, 'checkout', '-q', '-b', 'side')
  await commitFile(service, dir, 'a.txt', 'side')
  git(dir, 'checkout', '-q', 'main')
  await commitFile(service, dir, 'a.txt', 'main')

  // Leave a real merge stopped, the way a terminal would.
  assert.throws(() => git(dir, 'merge', 'side'))
  let state = await service.state({})
  assert.equal(state.repo.operation, 'merge')
  await assert.rejects(
    () => service.merge({ branch: 'side', type: 'local' }),
    error => error instanceof GitError && error.code === 'repository_busy' && error.detail.operation === 'merge',
  )
  await assert.rejects(
    () => service.dropCommit({ commit: state.branch.oid, confirm: true }),
    error => error instanceof GitError && error.code === 'repository_busy',
  )
  git(dir, 'merge', '--abort')

  // A rebase uses the cherry-pick machinery; the detector must still call it a
  // rebase, not a cherry-pick.
  git(dir, 'checkout', '-q', 'side')
  assert.throws(() => git(dir, 'rebase', 'main'))
  state = await service.state({})
  assert.equal(state.repo.operation, 'rebase')
  await assert.rejects(
    () => service.rebase({ branch: 'main', type: 'local' }),
    error => error instanceof GitError && error.code === 'repository_busy' && error.detail.operation === 'rebase',
  )
  git(dir, 'rebase', '--abort')

  state = await service.state({})
  assert.equal(state.repo.operation, null)
})
