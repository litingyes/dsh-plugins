import assert from 'node:assert/strict'
import test from 'node:test'
import { ACTIONS, isWriteTool } from '../github.js'

test('leading-verb names are writes', () => {
  const writes = [
    'create_pull_request',
    'add_issue_comment',
    'merge_pull_request',
    'update_issue',
    'push_files',
    'delete_file',
    'create_or_update_file',
    'assign_copilot_to_issue',
    'request_copilot_review',
    'dismiss_pull_request_review',
    'set_issue_labels',
    'submit_pull_request_review',
    'fork_repository',
    'lock_issue',
    'unlock_issue',
    'mark_pull_request_ready_for_review',
    'remove_issue_label',
    'reopen_issue',
  ]
  for (const name of writes) {
    assert.equal(isWriteTool(name), true, name)
  }
})

test('noun-first writers are caught by the trailing segment', () => {
  for (const name of ['issue_write', 'label_write', 'sub_issue_write', 'pull_request_review_write', 'actions_run_trigger']) {
    assert.equal(isWriteTool(name), true, name)
  }
})

test('read tools stay on the read side, including the one with a verb in the middle', () => {
  const reads = [
    'get_me',
    'list_issues',
    'list_pull_requests',
    'search_issues',
    'search_code',
    'get_file_contents',
    'list_commits',
    'get_commit',
    'get_latest_release',
    'list_issue_types',
    // `request` is a write verb, but only as the first segment; this is a read.
    'pull_request_read',
    'create' /* bare verb, no underscore — still a verb-first name */,
  ]
  for (const name of reads.filter(name => name !== 'create')) {
    assert.equal(isWriteTool(name), false, name)
  }
  // A bare verb is the leading segment, so it counts.
  assert.equal(isWriteTool('create'), true)
})

test('empty and malformed names are never writes', () => {
  for (const name of ['', '_', '__', '   ']) {
    assert.equal(isWriteTool(name), false, JSON.stringify(name))
  }
})

test('the action list is the closed set the route validates against', () => {
  assert.deepEqual([...ACTIONS], ['comment', 'close', 'reopen', 'merge', 'create-issue'])
})
