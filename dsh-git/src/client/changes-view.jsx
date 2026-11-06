/**
 * Working-tree view: the four git status groups, per-file staging, the diff
 * pane, and the commit box.
 *
 * Destructive work never happens on a single click: "discard" opens a Base UI
 * dialog and only the confirmed action is sent, with `confirm: true`, which the
 * Host independently requires.
 *
 * @module @litingyes/dsh-git/client/changes-view
 */

import * as React from 'react'
import { Checkbox } from '@base-ui-components/react/checkbox'
import { Dialog } from '@base-ui-components/react/dialog'
import { DiffView } from './diff-view.jsx'
import { CheckIcon, StageIcon, TrashIcon, UnstageIcon } from './icons.jsx'
import { IconButton } from './controls.jsx'
import { splitPath, statusLetter } from './format.js'

/** Which diff target each group's file reads from. */
const DIFF_TARGET = {
  staged: 'index',
  unstaged: 'worktree',
  untracked: 'worktree',
  conflicted: 'worktree',
}

/**
 * A tri-state group checkbox.
 *
 * @param {object} props checkbox props.
 * @returns {React.ReactElement} the checkbox.
 */
function GroupCheckbox({ checked, indeterminate, onCheckedChange, label }) {
  return React.createElement(
    Checkbox.Root,
    {
      className: 'dgit-check',
      checked,
      indeterminate,
      onCheckedChange,
      'aria-label': label,
    },
    React.createElement(Checkbox.Indicator, { className: 'dgit-check-ind' },
      indeterminate ? React.createElement('span', { className: 'dgit-check-dash' }) : React.createElement(CheckIcon, null)),
  )
}

/**
 * One file row.
 *
 * @param {object} props row props.
 * @returns {React.ReactElement} the row.
 */
function FileRow({ group, entry, selected, active, onToggleSelected, onOpen, onAction, t }) {
  const parts = splitPath(entry.path)
  const actions = React.createElement(
    'span',
    { className: 'dgit-row-actions' },
    group === 'staged'
      ? React.createElement(IconButton, {
          label: t('changes.unstage'),
          icon: React.createElement(UnstageIcon, null),
          onClick: event => {
            event.stopPropagation()
            onAction('unstage', [entry.path])
          },
        })
      : null,
    group === 'unstaged' || group === 'untracked'
      ? React.createElement(IconButton, {
          label: t('changes.stage'),
          icon: React.createElement(StageIcon, null),
          onClick: event => {
            event.stopPropagation()
            onAction('stage', [entry.path])
          },
        })
      : null,
    group === 'unstaged' || group === 'untracked'
      ? React.createElement(IconButton, {
          label: t('changes.discard'),
          icon: React.createElement(TrashIcon, null),
          onClick: event => {
            event.stopPropagation()
            onAction('discard', [entry.path])
          },
        })
      : null,
  )

  return React.createElement(
    'div',
    { className: 'dgit-filerow', 'data-selected': active ? '' : undefined },
    React.createElement(Checkbox.Root, {
      className: 'dgit-check',
      checked: selected,
      onCheckedChange: () => onToggleSelected(),
      'aria-label': entry.path,
    }, React.createElement(Checkbox.Indicator, { className: 'dgit-check-ind' }, React.createElement(CheckIcon, null))),
    React.createElement('span', { className: 'dgit-status', 'data-code': statusLetter(entry.status) }, statusLetter(entry.status)),
    // A real button for the row body: the checkbox and the action buttons stay
    // independently focusable instead of nesting controls inside a role=button.
    React.createElement('button', {
      type: 'button',
      className: 'dgit-path-btn',
      onClick: onOpen,
      title: entry.path,
    }, React.createElement('span', { className: 'dgit-path' },
      React.createElement('span', { className: 'dgit-path-dir' }, parts.dir),
      parts.base)),
    actions,
  )
}

/**
 * The changes view.
 *
 * @param {object} props view props.
 * @returns {React.ReactElement} the view.
 */
export function ChangesView({ changes, api, workspace, t, busy, onAction, stagedCount }) {
  const [selected, setSelected] = React.useState({})
  const [active, setActive] = React.useState(null)
  const [patch, setPatch] = React.useState({ loading: false, data: null, error: null })
  const [message, setMessage] = React.useState('')
  const [pendingDiscard, setPendingDiscard] = React.useState(null)

  const groups = [
    { id: 'staged', title: t('changes.staged'), entries: changes.staged ?? [] },
    { id: 'unstaged', title: t('changes.unstaged'), entries: changes.unstaged ?? [] },
    { id: 'untracked', title: t('changes.untracked'), entries: changes.untracked ?? [] },
    { id: 'conflicted', title: t('changes.conflicted'), entries: changes.conflicted ?? [] },
  ]
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)

  const openFile = React.useCallback(async (group, path) => {
    setActive({ group, path })
    setPatch({ loading: true, data: null, error: null })
    try {
      const payload = await api.diff({ workspace, target: DIFF_TARGET[group], path })
      setPatch({ loading: false, data: payload, error: null })
    } catch (error) {
      setPatch({ loading: false, data: null, error: error instanceof Error ? error.message : String(error) })
    }
  }, [api, workspace])

  const keyOf = (group, path) => `${group}:${path}`
  const isSelected = (group, path) => selected[keyOf(group, path)] === true

  const toggleOne = (group, path) => {
    setSelected(previous => {
      const next = { ...previous }
      const key = keyOf(group, path)
      if (next[key] === true) delete next[key]
      else next[key] = true
      return next
    })
  }

  const toggleGroup = (group) => {
    const keys = group.entries.map(entry => keyOf(group.id, entry.path))
    const allOn = keys.length > 0 && keys.every(key => selected[key] === true)
    setSelected(previous => {
      const next = { ...previous }
      for (const key of keys) {
        if (allOn) delete next[key]
        else next[key] = true
      }
      return next
    })
  }

  const selectedPaths = (group) => group.entries
    .filter(entry => isSelected(group.id, entry.path))
    .map(entry => entry.path)

  const runAction = async (action, paths, confirm = false) => {
    if (paths.length === 0) return
    const done = await onAction({ action, paths, ...(confirm ? { confirm: true } : {}) })
    if (done !== true) return
    setSelected({})
    if (active !== null && paths.includes(active.path)) {
      setActive(null)
      setPatch({ loading: false, data: null, error: null })
    }
  }

  const askDiscard = (paths) => {
    if (paths.length === 0) return
    setPendingDiscard(paths)
  }

  const commit = async () => {
    const trimmed = message.trim()
    if (trimmed === '' || stagedCount === 0) return
    const done = await onAction({ action: 'commit', message: trimmed })
    if (done === true) setMessage('')
  }

  const submitShortcut = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void commit()
    }
  }

  const list = total === 0
    ? React.createElement('div', { className: 'dgit-empty' }, t('changes.none'))
    : groups.map(group => {
        if (group.entries.length === 0) return null
        const chosen = selectedPaths(group)
        const allOn = group.entries.length > 0 && group.entries.every(entry => isSelected(group.id, entry.path))
        return React.createElement(
          'div',
          { className: 'dgit-group', key: group.id },
          React.createElement(
            'div',
            { className: 'dgit-group-head' },
            React.createElement(GroupCheckbox, {
              checked: allOn,
              indeterminate: chosen.length > 0 && !allOn,
              onCheckedChange: () => toggleGroup(group),
              label: `${t('changes.selectAll')} · ${group.title}`,
            }),
            React.createElement('span', { className: 'dgit-group-name' }, group.title),
            React.createElement('span', { className: 'dgit-count' }, String(group.entries.length)),
            React.createElement('span', { className: 'dgit-spacer' }),
            chosen.length === 0
              ? null
              : React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(IconButton, {
                    label: group.id === 'staged' ? t('changes.unstage') : t('changes.stage'),
                    icon: React.createElement(group.id === 'staged' ? UnstageIcon : StageIcon, null),
                    disabled: busy,
                    disabledReason: busy ? t('action.running') : undefined,
                    onClick: () => runAction(group.id === 'staged' ? 'unstage' : 'stage', chosen),
                  }),
                  group.id === 'staged'
                    ? null
                    : React.createElement(IconButton, {
                        label: t('changes.discard'),
                        icon: React.createElement(TrashIcon, null),
                        disabled: busy,
                        disabledReason: busy ? t('action.running') : undefined,
                        onClick: () => askDiscard(chosen),
                      }),
                ),
          ),
          group.entries.map(entry => React.createElement(FileRow, {
            key: `${group.id}:${entry.path}`,
            group: group.id,
            entry,
            selected: isSelected(group.id, entry.path),
            active: active !== null && active.group === group.id && active.path === entry.path,
            onToggleSelected: () => toggleOne(group.id, entry.path),
            onOpen: () => openFile(group.id, entry.path),
            onAction: (action, paths) => {
              if (action === 'discard') askDiscard(paths)
              else runAction(action, paths)
            },
            t,
          })),
        )
      })

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgit-split' },
      React.createElement('div', { className: 'dgit-split-list dgit-scroll' }, list),
      React.createElement(
        'div',
        { className: 'dgit-split-main' },
        active === null
          ? React.createElement('div', { className: 'dgit-empty' }, t('changes.selectFile'))
          : React.createElement(DiffView, {
              title: `${t(`diff.${DIFF_TARGET[active.group] === 'index' ? 'staged' : 'worktree'}`)} · ${active.path}`,
              data: patch.data,
              loading: patch.loading,
              error: patch.error,
              t,
            }),
      ),
    ),
    React.createElement(
      'div',
      { className: 'dgit-commitbox' },
      React.createElement('textarea', {
        className: 'dgit-textarea',
        placeholder: t('changes.messagePlaceholder'),
        value: message,
        onChange: event => setMessage(event.target.value),
        onKeyDown: submitShortcut,
        disabled: busy,
      }),
      React.createElement(
        'div',
        { className: 'dgit-commitbox-row' },
        React.createElement('span', { className: 'dgit-commitbox-hint' },
          stagedCount === 0 ? t('changes.nothingStaged') : `${t('changes.staged')}: ${stagedCount}`),
        React.createElement('button', {
          type: 'button',
          className: 'dgit-btn',
          'data-variant': 'primary',
          disabled: busy || stagedCount === 0 || message.trim() === '',
          onClick: commit,
        }, t('changes.commit')),
      ),
    ),
    React.createElement(
      Dialog.Root,
      { open: pendingDiscard !== null, onOpenChange: next => { if (next !== true) setPendingDiscard(null) } },
      React.createElement(
        Dialog.Portal,
        null,
        React.createElement(Dialog.Backdrop, { className: 'dgit-backdrop' }),
        React.createElement(
          Dialog.Popup,
          { className: 'dgit-dialog' },
          React.createElement(Dialog.Title, { className: 'dgit-dialog-title' }, t('changes.discardTitle')),
          React.createElement(Dialog.Description, { className: 'dgit-dialog-body' },
            `${t('changes.discardBody')}\n${(pendingDiscard ?? []).join('\n')}`),
          React.createElement(
            'div',
            { className: 'dgit-dialog-actions' },
            React.createElement(Dialog.Close, { className: 'dgit-btn' }, t('changes.cancel')),
            React.createElement('button', {
              type: 'button',
              className: 'dgit-btn',
              'data-variant': 'danger',
              onClick: () => {
                const paths = pendingDiscard ?? []
                setPendingDiscard(null)
                void runAction('discard', paths, true)
              },
            }, t('changes.confirm')),
          ),
        ),
      ),
    ),
  )
}
