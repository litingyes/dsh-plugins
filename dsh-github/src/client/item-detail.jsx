/**
 * One issue or pull request, with what a person needs to act on it: the body,
 * the conversation, the comment box, and the two buttons that change state.
 *
 * Merging and closing ask first. Both are one-way in practice — a merged pull
 * request cannot be unmerged from here, and a closed issue loses its place in
 * everyone's queue — so the dialog names the number it is about.
 *
 * @module @litingyes/dsh-github/client/item-detail
 */

import * as React from 'react'
import { Badge, Button, ConfirmDialog, IconButton, LabelChip, TextArea } from './controls.jsx'
import { BackIcon, ExternalIcon, IssueIcon, PullIcon } from './icons.jsx'
import { labelColor, relativeTime } from './format.js'

/**
 * Render the detail view.
 *
 * @param {object} props detail props.
 * @param {{item: object, comments: object[]}} props.detail loaded detail.
 * @param {'zh'|'en'} props.language reader's language.
 * @param {Function} props.t translation.
 * @param {Function} props.onBack return to the list.
 * @param {(body: string) => Promise<unknown>} props.onComment submit a comment.
 * @param {(action: string) => Promise<unknown>} props.onAction submit close/reopen/merge.
 * @param {boolean} props.busy a write is in flight.
 * @param {string|undefined} props.error last write failure.
 * @returns {React.ReactElement} the detail block.
 */
export function ItemDetail({ detail, language, t, onBack, onComment, onAction, busy, error }) {
  const item = detail.item
  const Icon = item.isPull ? PullIcon : IssueIcon
  const [draft, setDraft] = React.useState('')
  const [confirm, setConfirm] = React.useState(null)
  const [emptyWarning, setEmptyWarning] = React.useState(false)

  const submitComment = async () => {
    if (draft.trim() === '') {
      setEmptyWarning(true)
      return
    }
    setEmptyWarning(false)
    try {
      await onComment(draft)
      setDraft('')
    } catch {
      // The panel already rendered the failure; keep the draft so it can be retried.
    }
  }

  const askThen = action => setConfirm({ action })

  const confirmed = async () => {
    const action = confirm?.action
    setConfirm(null)
    if (action !== undefined) await onAction(action)
  }

  const confirmText =
    confirm === null
      ? ''
      : confirm.action === 'merge'
        ? t('detail.mergeNote')
        : t('detail.closeNote')

  return React.createElement(
    'div',
    { className: 'dgh-detail' },
    React.createElement(
      'div',
      { className: 'dgh-detail-head' },
      IconButton({ label: t('detail.back'), onClick: onBack, children: React.createElement(BackIcon, { size: 15 }) }),
      React.createElement(
        'div',
        { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' } },
        React.createElement(
          'div',
          { className: 'dgh-row-meta' },
          React.createElement('span', { className: 'dgh-row-number' }, `#${item.number}`),
          React.createElement(
            Badge,
            { tone: item.state === 'closed' ? 'closed' : item.state === 'merged' ? 'merged' : 'open' },
            item.state,
          ),
          item.isPull && item.draft === true ? React.createElement(Badge, { tone: 'warn' }, t('list.draft')) : null,
          item.author === '' ? null : React.createElement('span', { className: 'dgh-mono' }, `@${item.author}`),
          React.createElement('span', null, t('list.updated', { time: relativeTime(item.updatedAt, { language }) })),
        ),
        React.createElement('h2', { className: 'dgh-detail-title' }, item.title),
      ),
      React.createElement(IconButton, {
        label: t('panel.openInBrowser'),
        onClick: () => window.open(item.webUrl, '_blank', 'noopener'),
        children: React.createElement(ExternalIcon, { size: 14 }),
      }),
    ),

    item.labels.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'dgh-row-labels' },
          item.labels.map(label =>
            React.createElement(LabelChip, {
              key: label.name,
              name: label.name,
              color: labelColor(label.name, label.color),
            }),
          ),
        ),

    item.isPull
      ? React.createElement(
          'div',
          { className: 'dgh-row-meta' },
          React.createElement('span', { className: 'dgh-mono' }, t('list.pullMeta', { head: item.headRef, base: item.baseRef })),
          React.createElement(
            'span',
            null,
            t('detail.diffStat', { additions: item.additions ?? 0, deletions: item.deletions ?? 0 }),
          ),
          item.mergeable === false
            ? React.createElement(Badge, { tone: 'warn' }, t('detail.notMergeable'))
            : item.mergeable === true
              ? React.createElement(Badge, { tone: 'open' }, t('detail.mergeable'))
              : null,
        )
      : null,

    React.createElement('div', { className: 'dgh-detail-body' }, item.body === '' ? t('detail.noBody') : item.body),

    error === undefined ? null : React.createElement('p', { className: 'dgh-error-message' }, error),

    React.createElement(
      'div',
      { className: 'dgh-form' },
      React.createElement(TextArea, {
        value: draft,
        onChange: value => {
          setDraft(value)
          setEmptyWarning(false)
        },
        placeholder: t('detail.commentPlaceholder'),
        label: t('detail.commentPlaceholder'),
        disabled: busy,
      }),
      emptyWarning ? React.createElement('p', { className: 'dgh-error-message' }, t('error.bad_request')) : null,
      React.createElement(
        'div',
        { className: 'dgh-form-actions' },
        item.state === 'open'
          ? React.createElement(
              Button,
              { variant: 'danger', onClick: () => askThen(item.isPull ? 'merge' : 'close'), disabled: busy },
              item.isPull ? t('detail.merge') : t('detail.close'),
            )
          : null,
        item.state === 'closed'
          ? React.createElement(
              Button,
              { variant: 'secondary', onClick: () => onAction('reopen'), disabled: busy },
              t('detail.reopen'),
            )
          : null,
        React.createElement(Button, { variant: 'primary', onClick: submitComment, disabled: busy || draft.trim() === '' },
          busy ? t('detail.writing') : t('detail.comment'),
        ),
      ),
    ),

    React.createElement(
      'div',
      { className: 'dgh-section-title' },
      t('detail.comments'),
      React.createElement('span', null, String(detail.comments.length)),
    ),

    detail.comments.length === 0
      ? React.createElement('p', { className: 'dgh-error-hint' }, t('detail.noComments'))
      : detail.comments.map(comment =>
          React.createElement(
            'div',
            { key: comment.id, className: 'dgh-comment' },
            React.createElement(
              'div',
              { className: 'dgh-comment-head' },
              React.createElement('span', { className: 'dgh-mono' }, `@${comment.author}`),
              React.createElement('span', null, relativeTime(comment.createdAt, { language })),
            ),
            React.createElement('div', { className: 'dgh-comment-body' }, comment.body),
          ),
        ),

    React.createElement(ConfirmDialog, {
      open: confirm !== null,
      title: t('detail.confirmTitle'),
      message:
        confirm === null
          ? undefined
          : confirm.action === 'merge'
            ? `#${item.number} — ${confirmText}`
            : `#${item.number} — ${confirmText}`,
      confirmLabel:
        confirm === null ? t('detail.confirm') : confirm.action === 'merge' ? t('detail.merge') : t('detail.close'),
      cancelLabel: t('detail.cancel'),
      busy,
      onConfirm: confirmed,
      onCancel: () => setConfirm(null),
    }),
  )
}
