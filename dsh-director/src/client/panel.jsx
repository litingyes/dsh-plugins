/**
 * The director board shell: Session resolution, one data load per directory,
 * header, tabs and the four read-only views.
 *
 * The board is a right-Sidebar tab, so it does not own a workspace choice: the
 * Session that owns the tab owns the working directory, and the Host decides
 * whether that directory is inside a registered workspace.
 *
 * @module @litingyes/dsh-director/client/panel
 */

import * as React from 'react'
import { AudioView } from './audio-view.jsx'
import { PromptsView } from './prompts-view.jsx'
import { ReviewView } from './review-view.jsx'
import { StoryboardView } from './storyboard-view.jsx'
import { DirectorGuideIcon, RefreshIcon } from './icons.jsx'
import { formatSeconds, productionPath, statusKey } from './format.js'
import { useDirectorStore } from './store.js'
import { useTranslate } from './use-translate.js'

const EMPTY_SUMMARY = Object.freeze({
  scenes: 0,
  shots: 0,
  plannedSeconds: 0,
  targetSeconds: 0,
  takes: 0,
  selected: 0,
  statusCounts: {},
})

const TABS = [
  ['storyboard', 'tab.storyboard'],
  ['prompts', 'tab.prompts'],
  ['audio', 'tab.audio'],
  ['review', 'tab.review'],
]

/** A session projection hook for a render that has none. */
function useNoSessions() {
  return undefined
}

function Meta({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return React.createElement(
    'span',
    { className: 'ddr-meta-item' },
    `${label} `,
    React.createElement('b', null, String(value)),
  )
}

function Header({ snapshot, t, onRefresh, refreshing, failure }) {
  const project = snapshot.project ?? {}
  const summary = snapshot.review?.summary ?? EMPTY_SUMMARY
  const errors = Object.keys(snapshot.errors ?? {})
  const statuses = Object.entries(summary.statusCounts ?? {}).filter(([, count]) => count > 0)
  return React.createElement(
    'header',
    { className: 'ddr-header' },
    React.createElement(
      'div',
      { className: 'ddr-header-top' },
      React.createElement(
        'div',
        { className: 'ddr-brand' },
        React.createElement(DirectorGuideIcon, { size: 17 }),
      ),
      React.createElement(
        'div',
        { className: 'ddr-heading' },
        React.createElement('div', { className: 'ddr-title' }, project.title || t('tab.title')),
        project.logline === undefined || project.logline === ''
          ? null
          : React.createElement('div', { className: 'ddr-logline' }, project.logline),
        React.createElement(
          'div',
          { className: 'ddr-path', title: `${snapshot.dir}/${snapshot.root}` },
          productionPath(snapshot.dir, snapshot.root),
        ),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'ddr-btn ddr-icon-btn',
          'data-variant': 'ghost',
          onClick: onRefresh,
          title: t('panel.refresh'),
          'aria-label': t('panel.refresh'),
          disabled: refreshing,
        },
        React.createElement(RefreshIcon, { size: 15 }),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ddr-meta' },
      React.createElement(Meta, { label: t('header.aspect'), value: project.aspect }),
      React.createElement(Meta, { label: t('header.planned'), value: formatSeconds(summary.plannedSeconds) }),
      summary.targetSeconds > 0
        ? React.createElement(Meta, { label: t('header.target'), value: formatSeconds(summary.targetSeconds) })
        : null,
      React.createElement(Meta, { label: t('header.shots'), value: summary.shots }),
      React.createElement(Meta, { label: t('header.takes'), value: `${summary.selected}/${summary.takes}` }),
      ...(Array.isArray(project.products) ? project.products : []).map(product =>
        React.createElement('span', { className: 'ddr-chip', 'data-tone': 'brand', key: product }, product),
      ),
    ),
    statuses.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-meta' },
          ...statuses.map(([status, count]) =>
            React.createElement(
              'span',
              { className: 'ddr-chip ddr-status', 'data-status': status, key: status },
              `${t(statusKey(status))} ${count}`,
            ),
          ),
        ),
    errors.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-banner' },
          `${t('panel.errors')} (${errors.join(', ')})`,
        ),
    failure === null || failure === undefined
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-banner' },
          `${t('panel.error')}: ${typeof failure.message === 'string' ? failure.message : String(failure)}`,
        ),
  )
}

function Tabs({ tab, counts, onChange, t }) {
  return React.createElement(
    'div',
    { className: 'ddr-tabs', role: 'tablist' },
    TABS.map(([id, key]) =>
      React.createElement(
        'button',
        {
          key: id,
          type: 'button',
          role: 'tab',
          'aria-selected': tab === id,
          className: 'ddr-tab',
          'data-active': tab === id ? '' : undefined,
          onClick: () => onChange(id),
        },
        t(key),
        id === 'prompts' && counts.promptReady > 0
          ? React.createElement('span', { className: 'ddr-tab-count' }, counts.promptReady)
          : null,
        id === 'review' && counts.errors > 0
          ? React.createElement(
              'span',
              { className: 'ddr-tab-count', 'data-tone': 'error' },
              counts.errors,
            )
          : null,
      ),
    ),
  )
}

function PanelBody({ snapshot, tab, language, t }) {
  if (tab === 'prompts') return React.createElement(PromptsView, { snapshot, language, t })
  if (tab === 'audio') return React.createElement(AudioView, { snapshot, t })
  if (tab === 'review') return React.createElement(ReviewView, { snapshot, t })
  return React.createElement(StoryboardView, { snapshot, t })
}

function Loading({ t }) {
  return React.createElement(
    'div',
    { className: 'ddr-panel' },
    React.createElement(
      'div',
      { className: 'ddr-empty' },
      React.createElement('div', { className: 'ddr-empty-body' }, t('panel.loading')),
    ),
  )
}

function EmptyState({ t, reason }) {
  return React.createElement(
    'div',
    { className: 'ddr-panel' },
    React.createElement(
      'div',
      { className: 'ddr-empty' },
      React.createElement(
        'div',
        { className: 'ddr-empty-icon' },
        React.createElement(DirectorGuideIcon, { size: 22 }),
      ),
      React.createElement('div', { className: 'ddr-empty-title' }, reason ?? t('panel.emptyTitle')),
      reason === undefined ? React.createElement('div', { className: 'ddr-empty-body' }, t('panel.emptyBody')) : null,
      reason === undefined ? React.createElement('div', { className: 'ddr-empty-hint' }, t('panel.emptyHint')) : null,
    ),
  )
}

function ErrorState({ failure, onRetry, t }) {
  const code = typeof failure?.code === 'string' ? failure.code : ''
  const message = typeof failure?.message === 'string' ? failure.message : String(failure ?? '')
  return React.createElement(
    'div',
    { className: 'ddr-panel' },
    React.createElement(
      'div',
      { className: 'ddr-body' },
      React.createElement(
        'div',
        { className: 'ddr-error-box' },
        React.createElement('b', null, t('panel.error')),
        React.createElement('span', null, code === '' ? message : `${code}: ${message}`),
        React.createElement(
          'button',
          { type: 'button', className: 'ddr-btn', onClick: onRetry },
          t('panel.retry'),
        ),
      ),
    ),
  )
}

/**
 * The director board.
 *
 * @param {{
 *   stores: object,
 *   locale: object,
 *   sessionId?: string,
 *   useSessions?: (selector: Function) => unknown,
 * }} props client services and tab props.
 * @returns {React.ReactElement} panel.
 */
export function DirectorPanel({ stores, locale, sessionId, useSessions }) {
  const { t, language } = useTranslate(locale)
  const useSessionsHook = typeof useSessions === 'function' ? useSessions : useNoSessions
  const rawCwd = useSessionsHook(all =>
    sessionId === undefined ? undefined : all?.byId?.[sessionId]?.cwd,
  )
  const sessionsPending = useSessionsHook(all => all === undefined || all.phase === 'pending')
  const cwd = typeof rawCwd === 'string' && rawCwd !== '' ? rawCwd : undefined
  const store = cwd === undefined ? stores.idle : stores.forDir(cwd)
  const state = useDirectorStore(store)
  const [tab, setTab] = React.useState('storyboard')

  React.useEffect(() => {
    if (cwd === undefined) return undefined
    const onFocus = () => store.refresh()
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') store.refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [store, cwd])

  if (cwd === undefined) {
    if (sessionsPending) return React.createElement(Loading, { t })
    return React.createElement(EmptyState, { t, reason: t('panel.noSessionDir') })
  }
  if (state.status === 'idle' || (state.status === 'loading' && state.snapshot === null)) {
    return React.createElement(Loading, { t })
  }
  if (state.status === 'error' && state.snapshot === null) {
    return React.createElement(ErrorState, { failure: state.failure, onRetry: () => store.refresh(), t })
  }

  const snapshot = state.snapshot
  if (snapshot === null) return React.createElement(Loading, { t })
  if (snapshot.missing === true && snapshot.project === null) {
    return React.createElement(EmptyState, { t })
  }

  const shots = (snapshot.storyboard?.scenes ?? []).flatMap(scene => scene.shots ?? [])
  const counts = {
    promptReady: shots.filter(shot => typeof shot.prompt?.text === 'string' && shot.prompt.text.trim() !== '')
      .length,
    errors: snapshot.review?.findings?.filter(finding => finding.severity === 'error').length ?? 0,
  }

  return React.createElement(
    'div',
    { className: 'ddr-panel' },
    React.createElement(Header, {
      snapshot,
      t,
      refreshing: state.status === 'refreshing',
      onRefresh: () => store.refresh(),
      failure: state.failure,
    }),
    React.createElement(Tabs, { tab, counts, onChange: setTab, t }),
    React.createElement(PanelBody, { snapshot, tab, language, t }),
  )
}
