/**
 * Pure rules behind the chat-page branch picker: which branches are offered,
 * what the chip calls the current one, and how a Host refusal is worded.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  branchLabel,
  branchSwitchable,
  changedFileCount,
  filterBranches,
  localBranches,
} from '../src/client/branch-list.js'
import { failurePath, failureText } from '../src/client/failure.js'

/** A translator that returns the key plus its path argument, for assertions. */
function translate(key, vars) {
  return vars?.path === undefined ? key : `${key} (${vars.path})`
}

function branch(overrides) {
  return { name: 'main', type: 'local', current: false, worktreePath: null, ...overrides }
}

test('localBranches drops remote entries and tolerates absent lists', () => {
  assert.deepEqual(localBranches(undefined), [])
  assert.deepEqual(localBranches([branch(), { name: 'origin/main', type: 'remote' }]).map(item => item.name), ['main'])
})

test('filterBranches matches names case-insensitively and keeps Host order', () => {
  const list = [
    branch({ name: 'main' }),
    branch({ name: 'feat/git-panel' }),
    branch({ name: 'feature/docs' }),
    { name: 'origin/main', type: 'remote' },
  ]
  assert.deepEqual(filterBranches(list, '').map(item => item.name), ['main', 'feat/git-panel', 'feature/docs'])
  assert.deepEqual(filterBranches(list, '  PANEL ').map(item => item.name), ['feat/git-panel'])
  assert.deepEqual(filterBranches(list, 'feat').map(item => item.name), ['feat/git-panel', 'feature/docs'])
  assert.deepEqual(filterBranches(list, 'nope'), [])
})

test('branchLabel prefers the branch name, the short id when detached, and a fallback', () => {
  assert.equal(branchLabel({ head: 'main', detached: false }, translate), 'main')
  assert.equal(branchLabel({ head: '(detached)', detached: true, oid: 'abcdef1234567890' }, translate), 'abcdef1')
  assert.equal(branchLabel({ head: '(detached)', detached: true, oid: null }, translate), 'panel.defaultBranch')
  assert.equal(branchLabel(null, translate), 'panel.defaultBranch')
  assert.equal(branchLabel({ head: '', detached: false }, translate), 'panel.defaultBranch')
})

test('branchSwitchable refuses the current branch and one held by another worktree', () => {
  assert.equal(branchSwitchable(branch({ name: 'main' })), true)
  assert.equal(branchSwitchable(branch({ name: 'main', current: true })), false)
  assert.equal(branchSwitchable(branch({ name: 'main', worktreePath: '/repo/.agents/worktrees/main' })), false)
  assert.equal(branchSwitchable(null), false)
})

test('changedFileCount counts every group', () => {
  assert.equal(changedFileCount(undefined), 0)
  assert.equal(changedFileCount({}), 0)
  assert.equal(changedFileCount({
    staged: [{ path: 'a' }],
    unstaged: [{ path: 'b' }, { path: 'c' }],
    untracked: [{ path: 'd' }],
    conflicted: [],
  }), 4)
})

test('failureText maps machine codes and keeps the Host message otherwise', () => {
  const refusal = {
    code: 'branch_in_worktree',
    message: 'branch feature is already checked out',
    detail: { path: '/repo/.agents/worktrees/feature' },
  }
  assert.equal(failureText(refusal, translate), 'panel.branchInWorktree (/repo/.agents/worktrees/feature)')
  assert.equal(failurePath(refusal), '/repo/.agents/worktrees/feature')

  const flat = { code: 'worktree_exists', message: 'exists', path: '/repo/wt' }
  assert.equal(failureText(flat, translate), 'panel.worktreeExists (/repo/wt)')

  const raw = Object.assign(new Error('fatal: not a git repository'), { code: 'git_failed' })
  assert.equal(failureText(raw, translate), 'fatal: not a git repository')
  assert.equal(failurePath(raw), null)
})
