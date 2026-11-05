/**
 * Expanded commit details: message, identities, parents, and the file list.
 *
 * @module @litingyes/dsh-git/client/commit-detail
 */

import * as React from 'react'
import { CopyIcon } from './icons.jsx'
import { absoluteTime, copyText, relativeTime, splitPath, statusLetter } from './format.js'

/**
 * One labelled field.
 *
 * @param {{label: string, children: React.ReactNode}} props field props.
 * @returns {React.ReactElement} the field.
 */
function Field({ label, children }) {
  return React.createElement(
    'div',
    { className: 'dgit-field' },
    React.createElement('span', { className: 'dgit-field-label' }, label),
    React.createElement('span', { className: 'dgit-field-value' }, children),
  )
}

/**
 * The commit detail body.
 *
 * @param {object} props detail props.
 * @param {object|null} props.detail relaxed `/api/commit` payload.
 * @param {boolean} props.loading whether the request is in flight.
 * @param {string|null} props.error failure text.
 * @param {(path: string) => void} props.onSelectFile open one file's diff.
 * @param {string|null} props.selectedFile currently open file path.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {'zh'|'en'} props.language active language.
 * @returns {React.ReactElement} the detail.
 */
export function CommitDetail({ detail, loading, error, onSelectFile, selectedFile, t, language }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (copied !== true) return undefined
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  if (error !== null && error !== undefined) {
    return React.createElement('div', { className: 'dgit-detail' },
      React.createElement('div', { className: 'dgit-banner' },
        React.createElement('span', { className: 'dgit-banner-text' }, error)))
  }
  if (loading === true || detail === null || detail === undefined) {
    return React.createElement('div', { className: 'dgit-detail' },
      React.createElement('div', { className: 'dgit-field-label' }, t('graph.detailLoading')))
  }

  const files = Array.isArray(detail.files) ? detail.files : []

  const sha = React.createElement(
    'span',
    { className: 'dgit-inline' },
    React.createElement('code', { className: 'dgit-mono' }, detail.short),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgit-btn',
        'data-variant': 'ghost',
        title: t('graph.copySha'),
        onClick: async () => {
          const ok = await copyText(detail.sha)
          if (ok) setCopied(true)
        },
      },
      copied ? t('graph.copied') : React.createElement(CopyIcon, null),
    ),
  )

  return React.createElement(
    'div',
    { className: 'dgit-detail' },
    React.createElement(
      'div',
      { className: 'dgit-detail-grid' },
      React.createElement(Field, { label: t('graph.author') }, `${detail.author} <${detail.email}>`),
      React.createElement(Field, { label: t('graph.committer') },
        `${detail.committer} · ${absoluteTime(detail.commitTime)} (${relativeTime(detail.commitTime, language)})`),
      React.createElement(Field, { label: 'SHA' }, sha),
      React.createElement(Field, { label: t('graph.parents') },
        detail.parents.length === 0
          ? '—'
          : detail.parents.map(parent => React.createElement('code', {
              key: parent,
              className: 'dgit-mono',
              style: { marginRight: 8 },
            }, parent.slice(0, 7)))),
    ),
    React.createElement(
      'div',
      null,
      React.createElement('div', { className: 'dgit-detail-title', style: { marginBottom: 6 } }, t('graph.message')),
      React.createElement('pre', { className: 'dgit-message' }, detail.message),
    ),
    React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { className: 'dgit-detail-title', style: { marginBottom: 6 } },
        `${t('graph.files')} · ${files.length}`),
      files.length === 0
        ? React.createElement('div', { className: 'dgit-field-label' }, t('graph.noFiles'))
        : React.createElement(
            'div',
            { className: 'dgit-filelist' },
            files.map(row => {
              const parts = splitPath(row.path)
              return React.createElement(
                'button',
                {
                  key: `${row.status}:${row.path}`,
                  type: 'button',
                  className: 'dgit-filerow',
                  'data-selected': selectedFile === row.path ? '' : undefined,
                  title: t('graph.showFile'),
                  onClick: () => onSelectFile(row.path),
                },
                React.createElement('span', { className: 'dgit-status', 'data-code': statusLetter(row.status) },
                  statusLetter(row.status)),
                React.createElement('span', { className: 'dgit-path' },
                  React.createElement('span', { className: 'dgit-path-dir' }, parts.dir),
                  parts.base),
                React.createElement('span', { className: 'dgit-stat' },
                  row.additions === null ? null : React.createElement('span', { className: 'dgit-stat-add' }, `+${row.additions}`),
                  row.deletions === null ? null : React.createElement('span', { className: 'dgit-stat-del' }, `-${row.deletions}`)),
              )
            }),
          ),
      detail.filesTruncated === true
        ? React.createElement('div', { className: 'dgit-field-label', style: { marginTop: 6 } },
            t('graph.filesTruncated', { n: files.length }))
        : null,
    ),
  )
}
