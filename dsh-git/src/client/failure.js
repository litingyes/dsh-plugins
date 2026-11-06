/**
 * Failure presentation shared by the panel and the chat-page branch chip.
 *
 * The Host answers a refused action with a machine code, so both surfaces can
 * write the actionable sentence themselves instead of showing a bare git
 * message. Anything without a known code keeps the Host's own text: a `git
 * switch` refusal is more precise than a reworded guess.
 *
 * @module @litingyes/dsh-git/client/failure
 */

/** Machine codes whose message is better written by the plugin than by the Host. */
export const FAILURE_KEYS = {
  outside_workspace: 'panel.outsideWorkspace',
  unknown_workspace: 'panel.outsideWorkspace',
  no_workspace: 'panel.noWorkspace',
  branch_in_worktree: 'panel.branchInWorktree',
  unknown_worktree: 'panel.unknownWorktree',
  worktree_in_use: 'panel.worktreeInUse',
  worktree_exists: 'panel.worktreeExists',
  invalid_worktree_path: 'panel.invalidWorktreePath',
  // History actions. The conflict codes are the ones a reader meets most: the
  // Host aborts the stopped operation, so the sentence says what happened and
  // what state the repository is in.
  merge_conflict: 'action.mergeConflict',
  rebase_conflict: 'action.rebaseConflict',
  cherry_pick_conflict: 'action.cherryPickConflict',
  revert_conflict: 'action.revertConflict',
  worktree_dirty: 'action.worktreeDirty',
  repository_busy: 'action.repositoryBusy',
  not_ancestor: 'action.notAncestor',
  merge_commit: 'action.mergeCommit',
  root_commit: 'action.rootCommit',
  same_branch: 'action.sameBranch',
  same_commit: 'action.sameCommit',
  detached_head: 'action.detachedHead',
  no_commit: 'action.noCommit',
  unknown_commit: 'action.unknownCommit',
  merges_in_range: 'action.mergesInRange',
}

/**
 * The path a refusal is about, when the Host names one.
 *
 * `GitError.detail` is spread into the wire error, so `detail.path` arrives as a
 * top-level `path`; the nested read keeps a Host that sends the bare `detail`
 * object working too.
 *
 * @param {unknown} failure the thrown value.
 * @returns {string | null} the absolute path, or null when absent.
 */
export function failurePath(failure) {
  const detail = failure?.detail
  const nested = typeof detail?.path === 'string' ? detail.path : undefined
  const flat = typeof failure?.path === 'string' ? failure.path : undefined
  const found = nested ?? flat
  return found === '' || found === undefined ? null : found
}

/**
 * Resolve a failure into the line a surface shows.
 *
 * @param {unknown} failure the thrown value.
 * @param {(key: string, vars?: object) => string} t translator.
 * @returns {string} the message.
 */
export function failureText(failure, t) {
  const code = failure?.code
  const key = typeof code === 'string' ? FAILURE_KEYS[code] : undefined
  if (key !== undefined) {
    // The path is the actionable half of a worktree refusal: name the directory
    // the Host rejected so the banner can be acted on without retrying blindly.
    const at = failurePath(failure)
    return at === null ? t(key) : `${t(key)} (${at})`
  }
  return failure instanceof Error ? failure.message : String(failure)
}
