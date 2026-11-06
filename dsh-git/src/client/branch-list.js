/**
 * Pure branch-list rules shared by the chat-page picker.
 *
 * These are kept out of the React module so `node --test` can exercise them
 * directly: the Host already sorts the list (local first, current first), and
 * the picker only chooses which rows exist, what they are called, and whether
 * git could check them out.
 *
 * @module @litingyes/dsh-git/client/branch-list
 */

/**
 * Whether a branch entry carries a non-empty path.
 *
 * @param {unknown} value candidate worktree path.
 * @returns {boolean} true for a non-empty string.
 */
function hasPath(value) {
  return typeof value === 'string' && value !== ''
}

/**
 * The local branches from one snapshot, in Host order.
 *
 * Remote branches are not switchable from here: `git.checkout` only accepts a
 * local ref, and a remote row would be a button that always fails.
 *
 * @param {unknown} branches `state.branches`.
 * @returns {object[]} local entries.
 */
export function localBranches(branches) {
  if (!Array.isArray(branches)) return []
  return branches.filter(branch => branch !== null && typeof branch === 'object' && branch.type === 'local')
}

/**
 * Local branches matching a case-insensitive name filter.
 *
 * @param {unknown} branches `state.branches`.
 * @param {unknown} query filter text; blank returns every local branch.
 * @returns {object[]} matching entries.
 */
export function filterBranches(branches, query) {
  const locals = localBranches(branches)
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
  if (needle === '') return locals
  return locals.filter(branch => String(branch.name ?? '').toLowerCase().includes(needle))
}

/**
 * The label shown for the current branch.
 *
 * A detached HEAD has no branch name, so the short commit id is the honest
 * answer; an unborn repository still has `branch.head` and shows it.
 *
 * @param {object | null | undefined} branch `state.branch`.
 * @param {(key: string) => string} t translator.
 * @returns {string} the label.
 */
export function branchLabel(branch, t) {
  if (branch === null || branch === undefined) return t('panel.defaultBranch')
  if (branch.detached === true) {
    const oid = typeof branch.oid === 'string' ? branch.oid : ''
    return oid === '' ? t('panel.defaultBranch') : oid.slice(0, 7)
  }
  return typeof branch.head === 'string' && branch.head !== '' ? branch.head : t('panel.defaultBranch')
}

/**
 * Whether git could check this local branch out here.
 *
 * Mirrors the panel's branch row: the current branch is not a target, and a
 * branch another worktree holds is one git would refuse after the click.
 *
 * @param {object | null | undefined} branch one `state.branches` entry.
 * @returns {boolean} true when a switch button is offered.
 */
export function branchSwitchable(branch) {
  if (branch === null || branch === undefined) return false
  if (branch.current === true) return false
  return !hasPath(branch.worktreePath)
}

/**
 * Count the files in every change group.
 *
 * @param {unknown} changes `state.changes`.
 * @returns {number} total changed files.
 */
export function changedFileCount(changes) {
  if (changes === null || typeof changes !== 'object') return 0
  let total = 0
  for (const group of ['staged', 'unstaged', 'untracked', 'conflicted']) {
    const entries = changes[group]
    if (Array.isArray(entries)) total += entries.length
  }
  return total
}
