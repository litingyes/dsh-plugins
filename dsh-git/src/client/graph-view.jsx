/**
 * The multi-branch commit graph.
 *
 * Lane geometry comes from `src/shared/graph.js`; this file only draws what the
 * layout hands it. Each row is a Base UI `Collapsible`, so the disclosure is
 * keyboard-operable and `data-open` / `data-panel-open` drive the styling
 * without any state of our own beyond which row is open.
 *
 * The lane svg is absolutely positioned over the whole node and measures its
 * element with a `ResizeObserver`, so the through-lines stay continuous when a
 * row expands to show its details.
 *
 * @module @litingyes/dsh-git/client/graph-view
 */

import * as React from 'react'
import { Collapsible } from '@base-ui-components/react/collapsible'
import { Input } from '@base-ui-components/react/input'
import { Toggle } from '@base-ui-components/react/toggle'
import { ChevronRight, RefreshIcon } from './icons.jsx'
import { CommitDetail } from './commit-detail.jsx'
import { DiffView } from './diff-view.jsx'
import { ContextActions } from './menu.jsx'
import { IconButton } from './controls.jsx'
import { DropCommitDialog, commitMenuItems } from './commit-menu.jsx'
import { commitActionState, reachableFromHead } from './commit-actions.js'
import { layoutGraph } from '../shared/graph.js'
import { LANE_PALETTE } from './styles.js'
import { copyText, relativeTime } from './format.js'

/** Horizontal pitch of one lane, in pixels. */
const LANE_W = 16
/** Fixed height of a collapsed row, in pixels. */
const HEAD_H = 56
/** Vertical centre of the node dot inside the head. */
const HEAD_CENTER = 28

/**
 * Track one element's border-box height.
 *
 * @param {React.RefObject<HTMLElement>} ref element ref.
 * @param {number} fallback height before the first measurement.
 * @returns {number} the measured height.
 */
function useElementHeight(ref, fallback) {
  const [height, setHeight] = React.useState(fallback)
  React.useEffect(() => {
    const node = ref.current
    if (node === null || node === undefined) return undefined
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      const next = Math.round(entry.contentRect.height)
      if (next > 0) setHeight(previous => (previous === next ? previous : next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return height
}

/**
 * One row's lane work.
 *
 * @param {{row: object, height: number, laneCount: number}} props lane props.
 * @returns {React.ReactElement} the svg.
 */
function LaneSvg({ row, height, laneCount }) {
  const width = Math.max(1, laneCount) * LANE_W
  const x = lane => lane * LANE_W + LANE_W / 2
  const color = index => LANE_PALETTE[index % LANE_PALETTE.length]
  const children = []

  for (const segment of row.through) {
    children.push(React.createElement('line', {
      key: `t${segment.lane}`,
      x1: x(segment.lane),
      y1: 0,
      x2: x(segment.lane),
      y2: height,
      stroke: color(segment.color),
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }))
  }

  for (const segment of row.incoming) {
    const from = x(segment.from)
    const to = x(row.lane)
    children.push(React.createElement('path', {
      key: `i${segment.from}`,
      d: `M ${from} 0 C ${from} ${HEAD_CENTER * 0.55}, ${to} ${HEAD_CENTER * 0.45}, ${to} ${HEAD_CENTER}`,
      fill: 'none',
      stroke: color(segment.color),
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }))
  }

  for (const segment of row.outgoing) {
    const from = x(row.lane)
    const to = x(segment.to)
    if (segment.to === row.lane) {
      children.push(React.createElement('line', {
        key: `o${segment.to}`,
        x1: from,
        y1: HEAD_CENTER,
        x2: from,
        y2: height,
        stroke: color(segment.color),
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    } else {
      const tail = height - HEAD_CENTER
      children.push(React.createElement('path', {
        key: `o${segment.to}`,
        d: `M ${from} ${HEAD_CENTER} C ${from} ${HEAD_CENTER + tail * 0.45}, ${to} ${height - tail * 0.45}, ${to} ${height}`,
        fill: 'none',
        stroke: color(segment.color),
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }
  }

  children.push(React.createElement('circle', {
    key: 'node',
    cx: x(row.lane),
    cy: HEAD_CENTER,
    r: 4,
    fill: color(row.color),
    stroke: 'var(--dsw-alias-bg-base)',
    strokeWidth: 2,
  }))

  return React.createElement(
    'svg',
    {
      className: 'dgit-lanes',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      // The stylesheet stretches this box over the whole node, and the height
      // attribute is the row's measured height: between the two, one frame can
      // disagree. Filling the box without aspect correction keeps every lane
      // touching both edges in that frame, instead of scaling the drawing down
      // and centring it — which is precisely what breaks the line at a seam.
      preserveAspectRatio: 'none',
      'aria-hidden': true,
      focusable: 'false',
    },
    children,
  )
}

/** Longest ref name a chip prints whole; the rail is narrow in the right Sidebar. */
const REF_NAME_MAX = 22

/**
 * Clamp one ref name to what a chip can show; the tooltip keeps the full name.
 *
 * @param {unknown} name the ref name.
 * @returns {string} the printable label.
 */
function refLabel(name) {
  if (typeof name !== 'string') return ''
  return name.length > REF_NAME_MAX ? `${name.slice(0, REF_NAME_MAX - 1)}…` : name
}

/**
 * Branch and tag chips for one commit.
 *
 * @param {{refs: object[], t: Function}} props badge props.
 * @returns {React.ReactElement|null} the chips.
 */
function RefBadges({ refs, t }) {
  if (!Array.isArray(refs) || refs.length === 0) return null
  const shown = refs.slice(0, 3)
  const extra = refs.length - shown.length
  return React.createElement(
    React.Fragment,
    null,
    shown.map(ref => React.createElement(
      'span',
      {
        key: `${ref.type}:${ref.name}`,
        className: 'dgit-badge',
        'data-tone': ref.type === 'tag' ? 'tag' : ref.current ? 'head' : undefined,
        title: `${ref.name}${ref.current ? ` (${t('graph.badgeHead')})` : ''}`,
      },
      refLabel(ref.name),
    )),
    extra > 0 ? React.createElement('span', { key: 'extra', className: 'dgit-badge' }, `+${extra}`) : null,
  )
}

/**
 * One commit row.
 *
 * The row body is still a `Collapsible.Trigger`, so a click expands the node.
 * The context menu hangs off a wrapper around that trigger rather than the whole
 * node: the expanded detail contains a message a reader may want to select and
 * copy, and replacing the browser's own right-click menu there would take that
 * away.
 *
 * @param {object} props row props.
 * @param {object} props.availability from `commitActionState`.
 * @param {object} props.menu commit-action handlers.
 * @returns {React.ReactElement} the row.
 */
function CommitNode({
  commit,
  row,
  laneCount,
  open,
  onToggle,
  api,
  workspace,
  language,
  t,
  detailState,
  availability,
  menu,
}) {
  const nodeRef = React.useRef(null)
  const height = useElementHeight(nodeRef, HEAD_H)
  const [fileDiff, setFileDiff] = React.useState({ path: null, loading: false, data: null, error: null })
  const [selectedFile, setSelectedFile] = React.useState(null)

  const openFile = React.useCallback(async (filePath) => {
    setSelectedFile(filePath)
    setFileDiff({ path: filePath, loading: true, data: null, error: null })
    try {
      const payload = await api.diff({ workspace, target: 'commit', commit: commit.sha, path: filePath })
      setFileDiff({ path: filePath, loading: false, data: payload, error: null })
    } catch (error) {
      setFileDiff({
        path: filePath,
        loading: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [api, commit.sha, workspace])

  const gutter = Math.max(1, laneCount) * LANE_W + 10

  return React.createElement(
    Collapsible.Root,
    {
      className: 'dgit-node',
      open,
      onOpenChange: next => onToggle(next),
      style: { '--dgit-gutter': `${gutter}px` },
      ref: nodeRef,
      'data-open': open ? '' : undefined,
    },
    React.createElement(LaneSvg, { row, height, laneCount }),
    React.createElement(
      ContextActions,
      {
        label: `${t('graph.actions')}: ${commit.short}`,
        className: 'dgit-node-headwrap',
        items: commitMenuItems({
          commit,
          availability,
          t,
          onCopy: menu.copy,
          onCherryPick: menu.cherryPick,
          onRevert: menu.revert,
          onDrop: menu.drop,
        }),
      },
      React.createElement(
        Collapsible.Trigger,
        { className: 'dgit-node-head' },
        React.createElement(ChevronRight, { className: 'dgit-chevron' }),
        React.createElement(
          'span',
          { className: 'dgit-node-body' },
          React.createElement(
            'span',
            { className: 'dgit-node-subject' },
            React.createElement('span', { className: 'dgit-node-subject-text', title: commit.subject }, commit.subject),
            React.createElement(RefBadges, { refs: commit.refs, t }),
          ),
          React.createElement(
            'span',
            { className: 'dgit-node-meta' },
            React.createElement('span', { className: 'dgit-node-meta-author', title: commit.email }, commit.author),
            React.createElement('span', { 'aria-hidden': true }, '·'),
            React.createElement('span', { title: commit.authorTime }, relativeTime(commit.authorTime, language)),
            React.createElement('span', { 'aria-hidden': true }, '·'),
            React.createElement('code', { className: 'dgit-mono' }, commit.short),
          ),
        ),
      ),
    ),
    React.createElement(
      Collapsible.Panel,
      null,
      React.createElement(
        'div',
        null,
        React.createElement(CommitDetail, {
          detail: detailState.detail,
          loading: detailState.loading,
          error: detailState.error,
          onSelectFile: openFile,
          selectedFile,
          t,
          language,
        }),
        selectedFile === null
          ? null
          : React.createElement(DiffView, {
              title: `${t('diff.commit')} · ${commit.short} · ${selectedFile}`,
              data: fileDiff.data,
              loading: fileDiff.loading,
              error: fileDiff.error,
              t,
            }),
      ),
    ),
  )
}

/**
 * The graph view.
 *
 * History actions are offered per node through a right-click menu; the dialog
 * for the one destructive item lives here, once, rather than inside every row.
 *
 * @param {object} props view props.
 * @param {(body: object) => Promise<boolean>} [props.onAction] panel action runner.
 * @param {boolean} [props.busy] whether an action is in flight.
 * @param {string|null} [props.headOid] checked-out commit.
 * @param {boolean} [props.attached] HEAD is on a branch with a commit.
 * @param {string|null} [props.operation] in-progress merge/rebase/…
 * @param {boolean} [props.dirty] staged or unstaged tracked changes.
 * @returns {React.ReactElement} the view.
 */
export function GraphView({
  commits,
  api,
  workspace,
  language,
  t,
  headOnly,
  onToggleHeadOnly,
  onRefresh,
  onAction = () => Promise.resolve(false),
  busy = false,
  headOid = null,
  attached = true,
  operation = null,
  dirty = false,
}) {
  const [query, setQuery] = React.useState('')
  const [openSha, setOpenSha] = React.useState(null)
  const [details, setDetails] = React.useState({})
  const [pendingDrop, setPendingDrop] = React.useState(null)

  const layout = React.useMemo(() => layoutGraph(commits), [commits])
  const reachable = React.useMemo(() => reachableFromHead(commits, headOid), [commits, headOid])
  const availabilityContext = React.useMemo(
    () => ({ headOid, attached, operation, dirty, busy, reachable }),
    [headOid, attached, operation, dirty, busy, reachable],
  )

  const menu = React.useMemo(() => ({
    copy: (commit) => {
      void copyText(commit.sha)
    },
    cherryPick: (commit) => {
      void onAction({ action: 'cherry-pick', commit: commit.sha })
    },
    revert: (commit) => {
      void onAction({ action: 'revert', commit: commit.sha })
    },
    drop: (commit) => setPendingDrop(commit),
  }), [onAction])

  const confirmDrop = React.useCallback(async () => {
    if (pendingDrop === null) return
    const done = await onAction({ action: 'drop-commit', commit: pendingDrop.sha, confirm: true })
    if (done === true) setPendingDrop(null)
  }, [onAction, pendingDrop])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = []
    commits.forEach((commit, index) => {
      if (needle !== '') {
        const haystack = `${commit.subject} ${commit.author} ${commit.sha} ${commit.short}`.toLowerCase()
        if (!haystack.includes(needle)) return
      }
      rows.push({ commit, row: layout.rows[index] })
    })
    return rows
  }, [commits, layout, query])

  const loadDetail = React.useCallback((sha) => {
    setDetails(previous => ({
      ...previous,
      [sha]: { loading: true, detail: previous[sha]?.detail ?? null, error: null },
    }))
    api.commitDetail({ workspace, commit: sha })
      .then(payload => {
        setDetails(previous => ({ ...previous, [sha]: { loading: false, detail: payload.commit, error: null } }))
      })
      .catch(error => {
        setDetails(previous => ({
          ...previous,
          [sha]: {
            loading: false,
            detail: null,
            error: error instanceof Error ? error.message : String(error),
          },
        }))
      })
  }, [api, workspace])

  const toggle = React.useCallback((sha, next) => {
    setOpenSha(next ? sha : null)
    if (next && details[sha] === undefined) loadDetail(sha)
  }, [details, loadDetail])

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgit-toolbar' },
      React.createElement(
        Toggle,
        {
          className: 'dgit-btn',
          pressed: headOnly,
          onPressedChange: value => onToggleHeadOnly(value === true),
          title: t('graph.headOnly'),
        },
        headOnly ? t('graph.headOnly') : t('graph.allRefs'),
      ),
      React.createElement(Input, {
        className: 'dgit-input',
        style: { flex: '1 1 220px', maxWidth: 320 },
        placeholder: t('graph.search'),
        value: query,
        onChange: event => setQuery(event.target.value),
      }),
      React.createElement('span', { className: 'dgit-spacer' }),
      React.createElement('span', { className: 'dgit-count' }, t('graph.count', { n: filtered.length })),
      React.createElement(IconButton, {
        label: t('panel.refresh'),
        icon: React.createElement(RefreshIcon, null),
        onClick: onRefresh,
      }),
      layout.overflow
        ? React.createElement('span', { className: 'dgit-pill', 'data-tone': 'warn' }, t('graph.overflow'))
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dgit-graph' },
      filtered.length === 0
        ? React.createElement('div', { className: 'dgit-empty' }, t('graph.count', { n: 0 }))
        : filtered.map(({ commit, row }) => React.createElement(CommitNode, {
            key: commit.sha,
            commit,
            row,
            laneCount: layout.laneCount,
            open: openSha === commit.sha,
            onToggle: next => toggle(commit.sha, next),
            api,
            workspace,
            language,
            t,
            detailState: details[commit.sha] ?? { loading: false, detail: null, error: null },
            availability: commitActionState(commit, availabilityContext),
            menu,
          })),
    ),
    React.createElement(DropCommitDialog, {
      commit: pendingDrop,
      busy,
      t,
      onConfirm: () => {
        void confirmDrop()
      },
      onClose: () => setPendingDrop(null),
    }),
  )
}
