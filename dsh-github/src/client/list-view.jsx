/**
 * One list of issues, pull requests or notifications.
 *
 * The three shapes differ by a few fields, so one component renders all of them:
 * the icon, the number, the labels and the meta line are what actually change.
 * Rows are buttons, so the whole row is one keyboard stop.
 *
 * @module @litingyes/dsh-github/client/list-view
 */

import * as React from 'react'
import { Badge, EmptyState, LabelChip } from './controls.jsx'
import { BellIcon, CommentIcon, IssueIcon, PullIcon } from './icons.jsx'
import { formatCount, labelColor, relativeTime } from './format.js'

/**
 * The state pill of an issue or pull request.
 *
 * @param {{state: string, draft?: boolean, isPull?: boolean, t: Function}} props badge props.
 * @returns {React.ReactElement} the badge.
 */
function StateBadge({ state, draft = false, isPull = false, t }) {
  if (isPull && draft) return React.createElement(Badge, { tone: 'warn' }, t('list.draft'))
  const tone = state === 'closed' ? 'closed' : state === 'merged' ? 'merged' : 'open'
  return React.createElement(Badge, { tone }, state)
}

/**
 * Render one issue or pull request row.
 *
 * @param {{item: object, kind: 'issue'|'pull', language: 'zh'|'en', t: Function, onOpen: Function}} props row props.
 * @returns {React.ReactElement} the row.
 */
function ItemRow({ item, kind, language, t, onOpen }) {
  const Icon = kind === 'pull' ? PullIcon : IssueIcon
  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'dgh-row',
      onClick: () => onOpen(item),
      title: item.title,
    },
    React.createElement(Icon, {
      size: 14,
      className: `dgh-row-icon dgh-row-icon--${item.state === 'closed' ? 'closed' : 'open'}`,
    }),
    React.createElement(
      'div',
      { className: 'dgh-row-main' },
      React.createElement(
        'div',
        { className: 'dgh-row-title' },
        item.title === '' ? t('detail.noBody') : item.title,
      ),
      React.createElement(
        'div',
        { className: 'dgh-row-meta' },
        React.createElement('span', { className: 'dgh-row-number' }, `#${item.number}`),
        React.createElement(StateBadge, { state: item.state, draft: item.draft, isPull: kind === 'pull', t }),
        kind === 'pull' && item.headRef !== ''
          ? React.createElement(
              'span',
              { className: 'dgh-mono' },
              t('list.pullMeta', { head: item.headRef, base: item.baseRef }),
            )
          : null,
        React.createElement('span', null, t('list.updated', { time: relativeTime(item.updatedAt, { language }) })),
        item.comments > 0
          ? React.createElement(
              'span',
              { className: 'dgh-meta-item', title: t('list.comments', { count: item.comments }) },
              React.createElement(CommentIcon, { size: 11 }),
              formatCount(item.comments, language),
            )
          : null,
        item.author === '' ? null : React.createElement('span', { className: 'dgh-mono' }, `@${item.author}`),
      ),
      item.labels.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgh-row-labels' },
            item.labels.slice(0, 3).map(label =>
              React.createElement(LabelChip, {
                key: label.name,
                name: label.name,
                color: labelColor(label.name, label.color),
              }),
            ),
          ),
    ),
  )
}

/**
 * Render one notification row.
 *
 * @param {{item: object, language: 'zh'|'en', t: Function, onOpen: Function}} props row props.
 * @returns {React.ReactElement} the row.
 */
function NotificationRow({ item, language, t, onOpen }) {
  return React.createElement(
    'button',
    { type: 'button', className: 'dgh-row', onClick: () => onOpen(item), title: item.title },
    React.createElement(BellIcon, {
      size: 14,
      className: `dgh-row-icon${item.unread ? ' dgh-row-icon--open' : ''}`,
    }),
    React.createElement(
      'div',
      { className: 'dgh-row-main' },
      React.createElement('div', { className: 'dgh-row-title' }, item.title === '' ? item.type : item.title),
      React.createElement(
        'div',
        { className: 'dgh-row-meta' },
        React.createElement('span', null, item.reason),
        React.createElement('span', { className: 'dgh-mono' }, item.type),
        React.createElement('span', null, relativeTime(item.updatedAt, { language })),
      ),
    ),
  )
}

/**
 * Render the list for the active tab.
 *
 * @param {object} props list props.
 * @param {'issues'|'pulls'|'notifications'} props.tab active tab.
 * @param {object[]} props.items loaded rows.
 * @param {boolean} props.hasMore whether another page exists.
 * @param {boolean} props.loadingMore whether the next page is in flight.
 * @param {'zh'|'en'} props.language reader's language.
 * @param {Function} props.t translation.
 * @param {(item: object) => void} props.onOpen row activation.
 * @param {Function} props.onLoadMore next-page request.
 * @returns {React.ReactElement} the list block.
 */
export function ListView({ tab, items, hasMore, loadingMore, language, t, onOpen, onLoadMore }) {
  if (items.length === 0) {
    const title =
      tab === 'issues' ? t('list.noIssues') : tab === 'pulls' ? t('list.noPulls') : t('list.noNotifications')
    return React.createElement(EmptyState, { title })
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgh-list' },
      items.map(item =>
        tab === 'notifications'
          ? React.createElement(NotificationRow, {
              key: item.id,
              item,
              language,
              t,
              onOpen,
            })
          : React.createElement(ItemRow, {
              key: item.number,
              item,
              kind: tab === 'pulls' ? 'pull' : 'issue',
              language,
              t,
              onOpen,
            }),
      ),
    ),
    hasMore
      ? React.createElement(
          'div',
          { className: 'dgh-footer' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgh-button dgh-button--ghost',
              onClick: onLoadMore,
              disabled: loadingMore,
            },
            loadingMore ? t('panel.loadingMore') : t('panel.loadMore'),
          ),
        )
      : null,
  )
}
