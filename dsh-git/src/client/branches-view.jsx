/**
 * Branch and worktree list: switch to an existing local branch, create one at
 * HEAD, and manage the worktrees that hold branches.
 *
 * Branch rows are two lines by design. A right-Sidebar column is narrow and
 * resizable, and a single-line row cannot hold the name, its upstream, the
 * worktree that checked it out, and the age at once: whichever part is last
 * loses to the pane's clipping edge. The name keeps its own line, the slower
 * facts share a meta line that ellipsizes as a whole, and the controls live in
 * a non-shrinking third column that is always fully drawn.
 *
 * Removing a worktree is destructive, so it never happens on one click: the row
 * opens a dialog, and only the confirmed action is sent with `confirm: true`,
 * which the Host independently requires.
 *
 * @module @litingyes/dsh-git/client/branches-view
 */

import * as React from 'react'
import { Input } from '@base-ui-components/react/input'
import { BranchIcon, CopyIcon, PlusIcon, WorktreeIcon } from './icons.jsx'
import { absoluteTime, copyText, relativeTime } from './format.js'
import { WorktreeCreateDialog, WorktreeRemoveDialog, worktreeLabel } from './worktree-dialog.jsx'

/**
 * Whether a Host field carries a value.
 *
 * @param {unknown} value field value.
 * @returns {boolean} true for a non-empty string.
 */
function hasText(value) {
  return typeof value === 'string' && value !== ''
}

/**
 * One local branch row.
 *
 * @param {object} props row props.
 * @param {object} props.branch one `state.branches` local entry.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @param {(name: string) => void} props.onSwitch check out this branch.
 * @returns {React.ReactElement} the row.
 */
function BranchRow({ branch, busy, t, language, onSwitch }) {
  const upstream = hasText(branch.upstream) ? branch.upstream : ''
  const held = hasText(branch.worktreePath)
  // A branch this worktree has checked out is already marked "current"; a second
  // badge naming the same worktree would only repeat it.
  const heldElsewhere = held && branch.worktreeCurrent !== true
  const age = hasText(branch.commitTime) ? relativeTime(branch.commitTime, language) : ''

  // One meta line, ellipsized as a unit: nothing is hidden at narrow widths,
  // the row simply tells its story in fewer characters.
  const meta = []
  if (upstream !== '') meta.push(`${t('branches.upstream')} ${upstream}`)
  if (heldElsewhere) meta.push(t('worktree.badge'))
  if (age !== '') meta.push(age)

  // Whatever the visible line cannot fit stays one hover away.
  const metaTitle = []
  if (upstream !== '') metaTitle.push(upstream)
  if (heldElsewhere) metaTitle.push(branch.worktreePath)
  if (hasText(branch.commitTime)) metaTitle.push(absoluteTime(branch.commitTime))

  const actions = []
  if (heldElsewhere) {
    actions.push(React.createElement(
      'span',
      { key: 'worktree', className: 'dgit-badge', title: branch.worktreePath },
      React.createElement('span', { className: 'dgit-badge-text' }, t('worktree.badge')),
    ))
  }
  if (branch.current === true) {
    actions.push(React.createElement(
      'span',
      { key: 'current', className: 'dgit-pill', 'data-tone': 'brand' },
      t('branches.current'),
    ))
  } else {
    // git refuses to check out a branch another worktree holds, so the button is
    // off and names the holder instead of failing after the click.
    actions.push(React.createElement('button', {
      key: 'switch',
      type: 'button',
      className: 'dgit-btn',
      'data-variant': 'ghost',
      disabled: busy || held,
      title: held ? t('worktree.inUse', { path: branch.worktreePath }) : undefined,
      onClick: () => onSwitch(branch.name),
    }, t('branches.switch')))
  }

  return React.createElement(
    'div',
    {
      className: 'dgit-filerow dgit-branchrow',
      'data-selected': branch.current === true ? '' : undefined,
      style: { cursor: 'default' },
    },
    React.createElement(
      'span',
      { className: 'dgit-status', 'data-code': branch.current === true ? 'A' : 'M' },
      React.createElement(BranchIcon, null),
    ),
    React.createElement(
      'div',
      { className: 'dgit-branchrow-main' },
      React.createElement('span', {
        className: 'dgit-branchrow-name',
        style: { direction: 'ltr' },
        title: branch.name,
      }, branch.name),
      meta.length === 0
        ? null
        : React.createElement('span', {
            className: 'dgit-branchrow-meta',
            title: metaTitle.join(' · '),
          }, meta.join(' · ')),
    ),
    React.createElement('div', { className: 'dgit-branchrow-actions' }, actions),
  )
}

/**
 * One worktree row.
 *
 * The copy button is the only way to get the absolute path out of a truncated
 * cell, so it stays visible on every row and copies the full `path`, never the
 * shortened `displayPath`.
 *
 * @param {object} props row props.
 * @param {object} props.worktree one `state.worktrees` entry.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {(worktree: object) => void} props.onRemove open the confirmation dialog.
 * @returns {React.ReactElement} the row.
 */
function WorktreeRow({ worktree, busy, t, onRemove }) {
  const path = hasText(worktree.path) ? worktree.path : ''
  const display = hasText(worktree.displayPath) ? worktree.displayPath : path
  const head = hasText(worktree.head) ? worktree.head : ''
  const name = worktreeLabel(worktree, t)

  // The SHA moves into the meta line unless the name already is the SHA, so a
  // detached worktree does not print the same hash twice.
  const meta = head !== '' && head !== name ? [display, head] : [display]

  // The Host reports "absent" as null, and a locked/prunable record may carry a
  // why-string that belongs in the tooltip rather than in the chip.
  const badges = []
  if (worktree.current === true) {
    badges.push(React.createElement(
      'span',
      { key: 'current', className: 'dgit-pill', 'data-tone': 'brand' },
      t('worktree.current'),
    ))
  }
  if (worktree.locked !== null && worktree.locked !== undefined) {
    badges.push(React.createElement('span', {
      key: 'locked',
      className: 'dgit-pill',
      'data-tone': 'warn',
      title: hasText(worktree.locked) ? worktree.locked : undefined,
    }, t('worktree.locked')))
  }
  if (worktree.prunable !== null && worktree.prunable !== undefined) {
    badges.push(React.createElement('span', {
      key: 'prunable',
      className: 'dgit-pill',
      'data-tone': 'warn',
      title: hasText(worktree.prunable) ? worktree.prunable : undefined,
    }, t('worktree.prunable')))
  }

  // The main worktree and the one this panel reads cannot be removed; a button
  // that opens a dialog only to fail is worse than a disabled button with the
  // reason in its title.
  const removable = worktree.main !== true && worktree.current !== true

  const actions = badges.concat([
    React.createElement('button', {
      key: 'copy',
      type: 'button',
      className: 'dgit-btn',
      'data-variant': 'ghost',
      title: t('worktree.copyPath'),
      'aria-label': t('worktree.copyPath'),
      disabled: path === '',
      onClick: () => void copyText(path),
    }, React.createElement(CopyIcon, null)),
    React.createElement('button', {
      key: 'remove',
      type: 'button',
      className: 'dgit-btn',
      'data-variant': 'ghost',
      disabled: busy || !removable,
      title: removable ? t('worktree.remove') : t('worktree.removeBlocked'),
      onClick: () => onRemove(worktree),
    }, t('worktree.remove')),
  ])

  return React.createElement(
    'div',
    { className: 'dgit-filerow dgit-branchrow', style: { cursor: 'default' } },
    React.createElement(
      'span',
      { className: 'dgit-status', 'data-code': worktree.current === true ? 'A' : 'M' },
      React.createElement(BranchIcon, null),
    ),
    React.createElement(
      'div',
      { className: 'dgit-branchrow-main' },
      React.createElement('span', { className: 'dgit-branchrow-name', title: name }, name),
      React.createElement('span', {
        className: 'dgit-branchrow-meta',
        // The full path is the tooltip even when the row shows its short form.
        title: head === '' ? path : `${path} · ${head}`,
      }, meta.join(' · ')),
    ),
    React.createElement('div', { className: 'dgit-branchrow-actions' }, actions),
  )
}

/**
 * The branches view.
 *
 * @param {object} props view props.
 * @param {object[]} props.branches local and remote branches from `state.branches`.
 * @param {object[]} props.worktrees worktrees from `state.worktrees`.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(body: object) => Promise<boolean>} props.onAction panel action runner.
 * @returns {React.ReactElement} the view.
 */
export function BranchesView({ branches, worktrees, t, language, busy, onAction }) {
  const [name, setName] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [removing, setRemoving] = React.useState(null)

  const list = Array.isArray(branches) ? branches : []
  const locals = list.filter(branch => branch.type === 'local')
  const remotes = list.filter(branch => branch.type === 'remote')
  const worktreeRows = Array.isArray(worktrees) ? worktrees : []
  // `worktree prune` only has work to do when git reports a stale record, so the
  // button is absent rather than permanently disabled.
  const prunable = worktreeRows.some(entry => entry.prunable !== null && entry.prunable !== undefined)

  const create = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const done = await onAction({ action: 'create-branch', branch: trimmed })
    if (done === true) setName('')
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgit-toolbar' },
      React.createElement(Input, {
        className: 'dgit-input',
        style: { flex: '1 1 240px', maxWidth: 340 },
        placeholder: t('branches.createPlaceholder'),
        value: name,
        onChange: event => setName(event.target.value),
        onKeyDown: event => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void create()
        },
        disabled: busy,
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgit-btn',
          'data-variant': 'primary',
          disabled: busy || name.trim() === '',
          onClick: create,
        },
        React.createElement(PlusIcon, null),
        t('branches.createAction'),
      ),
    ),
    React.createElement(
      'div',
      { className: 'dgit-scroll' },
      React.createElement(
        'div',
        { className: 'dgit-group' },
        React.createElement('div', { className: 'dgit-group-head' },
          React.createElement('span', { className: 'dgit-group-name' }, t('branches.local')),
          React.createElement('span', { className: 'dgit-count' }, String(locals.length))),
        locals.length === 0
          ? React.createElement('div', { className: 'dgit-empty' }, t('branches.none'))
          : locals.map(branch => React.createElement(BranchRow, {
              key: branch.name,
              branch,
              busy,
              language,
              t,
              onSwitch: branchName => onAction({ action: 'checkout', branch: branchName }),
            })),
      ),
      remotes.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgit-group' },
            React.createElement('div', { className: 'dgit-group-head' },
              React.createElement('span', { className: 'dgit-group-name' }, t('branches.remote')),
              React.createElement('span', { className: 'dgit-count' }, String(remotes.length))),
            remotes.map(branch => React.createElement('div', {
              key: branch.name,
              className: 'dgit-filerow',
              style: { cursor: 'default' },
            },
            React.createElement('span', { className: 'dgit-status', 'data-code': 'M' }, React.createElement(BranchIcon, null)),
            React.createElement('span', { className: 'dgit-path', style: { direction: 'ltr' }, title: branch.name }, branch.name),
            hasText(branch.commitTime)
              ? React.createElement('span', { className: 'dgit-count dgit-branch-time' },
                  relativeTime(branch.commitTime, language))
              : null)),
          ),
      // A repository always has at least the worktree this panel reads, so an
      // empty list means the Host could not enumerate them: render nothing
      // rather than an empty section that looks like a failure.
      worktreeRows.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgit-group' },
            React.createElement(
              'div',
              { className: 'dgit-group-head' },
              React.createElement('span', { className: 'dgit-group-icon' },
                React.createElement(WorktreeIcon, null)),
              React.createElement('span', { className: 'dgit-group-name' }, t('worktree.title')),
              React.createElement('span', { className: 'dgit-count' }, String(worktreeRows.length)),
              React.createElement('span', { className: 'dgit-spacer' }),
              React.createElement('button', {
                type: 'button',
                className: 'dgit-btn',
                'data-variant': 'ghost',
                disabled: busy,
                title: t('worktree.create'),
                onClick: () => setCreating(true),
              },
              React.createElement(PlusIcon, null),
              t('worktree.create')),
              prunable
                ? React.createElement('button', {
                    type: 'button',
                    className: 'dgit-btn',
                    'data-variant': 'ghost',
                    disabled: busy,
                    title: t('worktree.prune'),
                    onClick: () => void onAction({ action: 'prune-worktrees' }),
                  }, t('worktree.prune'))
                : null,
            ),
            worktreeRows.map(entry => React.createElement(WorktreeRow, {
              key: entry.path,
              worktree: entry,
              busy,
              t,
              onRemove: target => setRemoving(target),
            })),
          ),
      React.createElement(WorktreeCreateDialog, {
        open: creating,
        busy,
        t,
        onAction,
        onClose: () => setCreating(false),
      }),
      React.createElement(WorktreeRemoveDialog, {
        worktree: removing,
        busy,
        t,
        onAction,
        onClose: () => setRemoving(null),
      }),
    ),
  )
}
