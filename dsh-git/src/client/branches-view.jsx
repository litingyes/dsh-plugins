/**
 * Branch and worktree list: switch to an existing local branch, create one at
 * HEAD, and manage the worktrees that hold branches.
 *
 * The sections fold. A repository usually carries more worktrees than branches a
 * reader cares about at one moment, so each section's header is a button that
 * shows or hides its rows, and the worktree section — the one this panel exists
 * for — sits above the remote branches that nobody checks out.
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
import {
  BranchIcon,
  ChevronRight,
  CopyIcon,
  PlusIcon,
  PruneIcon,
  SwitchIcon,
  TrashIcon,
  WorktreeIcon,
} from './icons.jsx'
import { absoluteTime, copyText, relativeTime } from './format.js'
import { WorktreeCreateDialog, WorktreeRemoveDialog, worktreeLabel } from './worktree-dialog.jsx'
import { IconButton } from './controls.jsx'
import { ContextActions, refusalText } from './menu.jsx'
import { branchActionState } from './branch-actions.js'

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
 * One collapsible section header.
 *
 * The name and the count are a button so the whole section folds with one click.
 * A section's own actions are passed as children instead of being nested inside
 * that button, because a button inside a button is not a control the browser can
 * lay out — the actions stay siblings, separated by the spacer.
 *
 * @param {object} props header props.
 * @param {React.ReactNode} [props.icon] mark shown before the name.
 * @param {string} props.name section name.
 * @param {number} props.count rows in the section.
 * @param {boolean} props.open whether the rows are visible.
 * @param {() => void} props.onToggle fold request.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {React.ReactNode} [props.children] the section's own actions.
 * @returns {React.ReactElement} the header.
 */
function GroupHeader({ icon, name, count, open, onToggle, t, children }) {
  return React.createElement(
    'div',
    { className: 'dgit-group-head' },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgit-group-toggle',
        'aria-expanded': open === true,
        title: open === true ? t('groups.collapse') : t('groups.expand'),
        'data-open': open === true ? '' : undefined,
        onClick: onToggle,
      },
      React.createElement(ChevronRight, { className: 'dgit-group-chevron' }),
      icon === undefined || icon === null
        ? null
        : React.createElement('span', { className: 'dgit-group-icon' }, icon),
      React.createElement('span', { className: 'dgit-group-name' }, name),
      React.createElement('span', { className: 'dgit-count' }, String(count)),
    ),
    React.createElement('span', { className: 'dgit-spacer' }),
    children,
  )
}

/**
 * The two history items every branch row offers.
 *
 * @param {object} options item options.
 * @param {object} options.branch the row's branch.
 * @param {{merge: object, rebase: object}} options.availability from `branchActionState`.
 * @param {(key: string, vars?: object) => string} options.t translator.
 * @param {(branch: object) => void} options.onMerge merge it into HEAD.
 * @param {(branch: object) => void} options.onRebase rebase HEAD onto it.
 * @returns {object[]} menu items for `ContextActions`.
 */
function branchMenuItems({ branch, availability, t, onMerge, onRebase }) {
  return [
    {
      key: 'merge',
      label: t('branches.merge'),
      disabled: availability.merge.enabled !== true,
      reason: refusalText(availability.merge, t),
      onSelect: () => onMerge(branch),
    },
    {
      key: 'rebase',
      label: t('branches.rebase'),
      disabled: availability.rebase.enabled !== true,
      reason: refusalText(availability.rebase, t),
      onSelect: () => onRebase(branch),
    },
  ]
}

/**
 * One remote branch row.
 *
 * Remote branches are merge and rebase targets only: this panel never checks
 * one out, so the row carries the context menu and nothing else.
 *
 * @param {object} props row props.
 * @param {object} props.branch one `state.branches` remote entry.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @param {object} props.context snapshot facts for `branchActionState`.
 * @param {(branch: object) => void} props.onMerge merge request.
 * @param {(branch: object) => void} props.onRebase rebase request.
 * @returns {React.ReactElement} the row.
 */
function RemoteBranchRow({ branch, t, language, context, onMerge, onRebase }) {
  const availability = branchActionState(branch, context)
  return React.createElement(
    ContextActions,
    {
      label: `${t('branches.actions')}: ${branch.name}`,
      className: 'dgit-filerow',
      attributes: { style: { cursor: 'default' } },
      items: branchMenuItems({ branch, availability, t, onMerge, onRebase }),
    },
    React.createElement('span', { className: 'dgit-status', 'data-code': 'M' }, React.createElement(BranchIcon, null)),
    React.createElement('span', {
      className: 'dgit-path',
      style: { direction: 'ltr' },
      title: branch.name,
    }, branch.name),
    hasText(branch.commitTime)
      ? React.createElement('span', { className: 'dgit-count dgit-branch-time' },
          relativeTime(branch.commitTime, language))
      : null,
  )
}

/**
 * One local branch row.
 *
 * @param {object} props row props.
 * @param {object} props.branch one `state.branches` local entry.
 * @param {object} props.context snapshot facts for `branchActionState`.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @param {(name: string) => void} props.onSwitch check out this branch.
 * @param {(branch: object) => void} props.onMerge merge it into HEAD.
 * @param {(branch: object) => void} props.onRebase rebase HEAD onto it.
 * @returns {React.ReactElement} the row.
 */
function BranchRow({ branch, context, busy, t, language, onSwitch, onMerge, onRebase }) {
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

  const availability = branchActionState(branch, context)

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
    // off and its tooltip names the holder instead of failing after the click.
    actions.push(React.createElement(IconButton, {
      key: 'switch',
      label: t('branches.switch'),
      icon: React.createElement(SwitchIcon, null),
      disabled: busy || held,
      disabledReason: held ? t('worktree.inUse', { path: branch.worktreePath }) : undefined,
      onClick: () => onSwitch(branch.name),
    }))
  }

  return React.createElement(
    ContextActions,
    {
      label: `${t('branches.actions')}: ${branch.name}`,
      className: 'dgit-filerow dgit-branchrow',
      attributes: {
        'data-selected': branch.current === true ? '' : undefined,
        style: { cursor: 'default' },
      },
      items: branchMenuItems({ branch, availability, t, onMerge, onRebase }),
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
  // that opens a dialog only to fail is worse than a disabled button whose
  // tooltip explains why.
  const removable = worktree.main !== true && worktree.current !== true

  const actions = badges.concat([
    React.createElement(IconButton, {
      key: 'copy',
      label: t('worktree.copyPath'),
      icon: React.createElement(CopyIcon, null),
      disabled: path === '',
      onClick: () => void copyText(path),
    }),
    React.createElement(IconButton, {
      key: 'remove',
      label: t('worktree.remove'),
      icon: React.createElement(TrashIcon, null),
      disabled: busy || !removable,
      disabledReason: !removable
        ? t('worktree.removeBlocked')
        : busy ? t('action.running') : undefined,
      onClick: () => onRemove(worktree),
    }),
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
 * Merge and rebase live in a right-click menu on each row: they act on the other
 * branch relative to HEAD, and a narrow row only has room for one always-visible
 * control (the switch icon). Both are gated by `branchActionState` so a disabled
 * entry can say why.
 *
 * @param {object} props view props.
 * @param {object[]} props.branches local and remote branches from `state.branches`.
 * @param {object[]} props.worktrees worktrees from `state.worktrees`.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(body: object) => Promise<boolean>} props.onAction panel action runner.
 * @param {object|null} [props.branch] `state.branch`, for the history preconditions.
 * @param {boolean} [props.isEmpty] the repository has no commits.
 * @param {string|null} [props.operation] in-progress merge/rebase/…
 * @param {boolean} [props.dirty] staged or unstaged tracked changes.
 * @returns {React.ReactElement} the view.
 */
export function BranchesView({
  branches,
  worktrees,
  t,
  language,
  busy,
  onAction,
  branch = null,
  isEmpty = false,
  operation = null,
  dirty = false,
}) {
  const [name, setName] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [removing, setRemoving] = React.useState(null)
  // Sections start open: the lists are short enough that hiding them by default
  // would cost a click to see anything. Folding is remembered per view, so the
  // panel reopens in the shape the reader left it in.
  const [open, setOpen] = React.useState({ local: true, worktrees: true, remote: true })

  const list = Array.isArray(branches) ? branches : []
  const locals = list.filter(entry => entry.type === 'local')
  const remotes = list.filter(entry => entry.type === 'remote')
  const worktreeRows = Array.isArray(worktrees) ? worktrees : []
  // `worktree prune` only has work to do when git reports a stale record, so the
  // button is absent rather than permanently disabled.
  const prunable = worktreeRows.some(entry => entry.prunable !== null && entry.prunable !== undefined)

  // One context object per render: every row's menu answers from the same
  // snapshot, so two rows cannot disagree about whether the tree is clean.
  const context = {
    hasCommit: isEmpty !== true,
    attached: isEmpty !== true && branch?.detached !== true,
    operation,
    dirty,
    busy,
  }

  const toggle = (key) => setOpen(previous => ({ ...previous, [key]: previous[key] !== true }))

  const create = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const done = await onAction({ action: 'create-branch', branch: trimmed })
    if (done === true) setName('')
  }

  // A remote branch answers `type: 'remote'` so the Host picks the full
  // `refs/remotes/...` name instead of guessing between two short names.
  const merge = (target) => void onAction({ action: 'merge', branch: target.name, type: target.type })
  const rebase = (target) => void onAction({ action: 'rebase', branch: target.name, type: target.type })

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
      React.createElement(IconButton, {
        label: t('branches.createAction'),
        icon: React.createElement(PlusIcon, null),
        variant: 'primary',
        disabled: busy || name.trim() === '',
        disabledReason: busy ? t('action.running') : undefined,
        onClick: create,
      }),
    ),
    React.createElement(
      'div',
      { className: 'dgit-scroll' },
      React.createElement(
        'div',
        { className: 'dgit-group' },
        React.createElement(GroupHeader, {
          name: t('branches.local'),
          count: locals.length,
          open: open.local === true,
          onToggle: () => toggle('local'),
          t,
        }),
        open.local === true
          ? (locals.length === 0
              ? React.createElement('div', { className: 'dgit-empty' }, t('branches.none'))
              : locals.map(entry => React.createElement(BranchRow, {
                  key: entry.name,
                  branch: entry,
                  context,
                  busy,
                  language,
                  t,
                  onSwitch: branchName => onAction({ action: 'checkout', branch: branchName }),
                  onMerge: merge,
                  onRebase: rebase,
                })))
          : null,
      ),
      // The worktree section sits above Remote: it describes this machine and is
      // actionable, while a remote branch is a name nobody switches to from here.
      // An empty list means the Host could not enumerate them, so the section is
      // absent rather than an empty-looking failure.
      worktreeRows.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgit-group' },
            React.createElement(
              GroupHeader,
              {
                icon: React.createElement(WorktreeIcon, null),
                name: t('worktree.title'),
                count: worktreeRows.length,
                open: open.worktrees === true,
                onToggle: () => toggle('worktrees'),
                t,
              },
              React.createElement(IconButton, {
                label: t('worktree.create'),
                icon: React.createElement(PlusIcon, null),
                disabled: busy,
                disabledReason: busy ? t('action.running') : undefined,
                onClick: () => setCreating(true),
              }),
              prunable
                ? React.createElement(IconButton, {
                    label: t('worktree.prune'),
                    icon: React.createElement(PruneIcon, null),
                    disabled: busy,
                    disabledReason: busy ? t('action.running') : undefined,
                    onClick: () => void onAction({ action: 'prune-worktrees' }),
                  })
                : null,
            ),
            open.worktrees === true
              ? worktreeRows.map(entry => React.createElement(WorktreeRow, {
                  key: entry.path,
                  worktree: entry,
                  busy,
                  t,
                  onRemove: target => setRemoving(target),
                }))
              : null,
          ),
      remotes.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgit-group' },
            React.createElement(GroupHeader, {
              name: t('branches.remote'),
              count: remotes.length,
              open: open.remote === true,
              onToggle: () => toggle('remote'),
              t,
            }),
            open.remote === true
              ? remotes.map(entry => React.createElement(RemoteBranchRow, {
                  key: entry.name,
                  branch: entry,
                  t,
                  language,
                  context,
                  onMerge: merge,
                  onRebase: rebase,
                }))
              : null,
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
