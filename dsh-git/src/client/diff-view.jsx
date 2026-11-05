/**
 * Patch rendering shared by the working-tree view and the commit view.
 *
 * A unified diff is already line-oriented, so this is a pure classifier plus a
 * list: no highlighter, no diff algorithm, no dependency. Binary patches and
 * oversized patches are announced instead of dumped.
 *
 * @module @litingyes/dsh-git/client/diff-view
 */

import * as React from 'react'

/** Lines that describe the file rather than its content. */
const META_PREFIXES = [
  'diff ',
  'index ',
  '--- ',
  '+++ ',
  'new file',
  'deleted file',
  'old mode',
  'new mode',
  'similarity index',
  'dissimilarity index',
  'rename from',
  'rename to',
  'copy from',
  'copy to',
  'Binary files',
  'GIT binary patch',
]

/**
 * Classify one patch into renderable lines.
 *
 * @param {string} patch unified diff text.
 * @returns {{type: 'meta'|'hunk'|'add'|'del'|'ctx', text: string}[]} lines.
 */
export function parsePatchLines(patch) {
  if (typeof patch !== 'string' || patch === '') return []
  return patch.split('\n').map(line => {
    if (line.startsWith('@@')) return { type: 'hunk', text: line }
    for (const prefix of META_PREFIXES) {
      if (line.startsWith(prefix)) return { type: 'meta', text: line }
    }
    if (line.startsWith('+')) return { type: 'add', text: line }
    if (line.startsWith('-')) return { type: 'del', text: line }
    return { type: 'ctx', text: line }
  })
}

/**
 * Render one patch pane.
 *
 * @param {object} props pane props.
 * @param {string} [props.title] sticky pane title.
 * @param {object|null} [props.data] the `/api/diff` payload.
 * @param {boolean} [props.loading] whether a request is in flight.
 * @param {string|null} [props.error] failure text.
 * @param {string} [props.emptyText] text when the payload has no body.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {React.ReactNode} [props.actions] trailing controls in the sticky head.
 * @returns {React.ReactElement} the pane.
 */
export function DiffView({ title, data, loading, error, emptyText, t, actions }) {
  const lines = React.useMemo(() => (data === null || data === undefined ? [] : parsePatchLines(data.patch)), [data])

  const head = title === undefined && actions === undefined
    ? null
    : React.createElement(
        'div',
        { className: 'dgit-diff-head' },
        title === undefined ? null : React.createElement('span', { className: 'dgit-path', title }, title),
        React.createElement('span', { className: 'dgit-spacer' }),
        actions ?? null,
      )

  const body = (() => {
    if (error !== null && error !== undefined) {
      return React.createElement('div', { className: 'dgit-empty' }, error)
    }
    if (loading === true) {
      return React.createElement('div', { className: 'dgit-empty' }, t('diff.loading'))
    }
    if (data === null || data === undefined) return null
    if (data.binary === true) {
      return React.createElement('div', { className: 'dgit-empty' }, t('diff.binary'))
    }
    if (lines.length === 0) {
      return React.createElement('div', { className: 'dgit-empty' }, emptyText ?? t('diff.empty'))
    }
    return React.createElement(
      'div',
      null,
      lines.map((line, index) => React.createElement('code', {
        key: `${index}-${line.type}`,
        className: 'dgit-dl',
        'data-t': line.type,
      }, line.text === '' ? '\u200b' : line.text)),
    )
  })()

  const notice = data !== null && data !== undefined && data.truncated === true
    ? React.createElement('div', { className: 'dgit-banner' },
        React.createElement('span', { className: 'dgit-banner-text' }, t('diff.truncated', { n: data.bytes })))
    : null

  return React.createElement(
    'div',
    { className: 'dgit-diff' },
    head,
    notice,
    body,
  )
}
