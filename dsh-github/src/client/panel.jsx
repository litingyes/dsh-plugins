/**
 * The right-sidebar tab body: which repository, which list, which item.
 *
 * The panel follows its Session. It receives a `sessionId`, asks the framework
 * for that Session's working directory, and sends the directory with every
 * request — the Host decides which GitHub repository that is. A workspace with
 * no GitHub remote can name one by hand; the choice lives in this panel's state
 * and is never written anywhere.
 *
 * Every list request is abortable and superseded requests are dropped, so
 * switching tabs quickly cannot paint an older answer over a newer one.
 *
 * @module @litingyes/dsh-github/client/panel
 */

import * as React from 'react'
import { Button, EmptyState, ErrorCard, IconButton, Segmented, Spinner, TextArea, TextInput } from './controls.jsx'
import { ExternalIcon, RefreshIcon } from './icons.jsx'
import { ItemDetail } from './item-detail.jsx'
import { ListView } from './list-view.jsx'
import { RepoHeader } from './repo-header.jsx'
import { actionPayload, errorText } from './actions.js'
import { issueKey, mergePage, notificationKey } from './format.js'
import { useTranslate } from './use-translate.js'

/** A Session projection that never answers, for a panel rendered without one. */
function useNoSessions() {
  return undefined
}

/** Tabs and the filters each one offers. */
const TABS = ['issues', 'pulls', 'notifications']

/**
 * Render the GitHub tab.
 *
 * @param {object} props panel props.
 * @param {object} props.api the `api-client` object.
 * @param {object | undefined} props.locale the Client locale service.
 * @param {string | undefined} props.sessionId the Session whose tab this is.
 * @param {(selector: Function) => unknown} [props.useSessions] session projection hook.
 * @returns {React.ReactElement} the panel.
 */
export function GithubPanel({ api, locale, sessionId, useSessions }) {
  const { t, language } = useTranslate(locale)

  const useSessionsHook = typeof useSessions === 'function' ? useSessions : useNoSessions
  const rawCwd = useSessionsHook(all => (sessionId === undefined ? undefined : all?.byId?.[sessionId]?.cwd))
  const sessionsPending = useSessionsHook(all => all === undefined || all.phase === 'pending')
  const cwd = typeof rawCwd === 'string' && rawCwd !== '' ? rawCwd : undefined

  const [repoOverride, setRepoOverride] = React.useState('')
  const [manualDraft, setManualDraft] = React.useState('')

  const [auth, setAuth] = React.useState({ phase: 'loading' })
  const [context, setContext] = React.useState({ phase: 'idle' })
  const [tab, setTab] = React.useState('issues')
  const [issueState, setIssueState] = React.useState('open')
  const [issueFilter, setIssueFilter] = React.useState('all')
  const [list, setList] = React.useState({ phase: 'idle', items: [], hasMore: false, page: 1 })
  const [detail, setDetail] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [writeError, setWriteError] = React.useState(undefined)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createTitle, setCreateTitle] = React.useState('')
  const [createBody, setCreateBody] = React.useState('')
  const [importing, setImporting] = React.useState(false)
  const [authNotice, setAuthNotice] = React.useState(undefined)

  const override = repoOverride === '' ? undefined : repoOverride
  const ready = cwd !== undefined || override !== undefined

  const refreshAuth = React.useCallback(async () => {
    try {
      const value = await api.auth()
      setAuth({ phase: 'ready', ...value })
    } catch (error) {
      setAuth({ phase: 'error', error })
    }
  }, [api])

  const refreshContext = React.useCallback(async () => {
    if (!ready) {
      setContext({ phase: 'idle' })
      return
    }
    setContext({ phase: 'loading' })
    try {
      const value = await api.context({ dir: cwd, repo: override })
      setContext({ phase: 'ready', ...value })
    } catch (error) {
      setContext({ phase: 'error', error })
    }
  }, [api, cwd, override, ready])

  React.useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  React.useEffect(() => {
    refreshContext()
  }, [refreshContext])

  const listController = React.useRef(null)

  const loadList = React.useCallback(
    async (options = {}) => {
      if (!ready) return
      const page = options.page ?? 1
      const append = options.append === true
      listController.current?.abort()
      const controller = new AbortController()
      listController.current = controller
      setList(previous =>
        append
          ? { ...previous, phase: 'more' }
          : { phase: 'loading', items: [], hasMore: false, page: 1 },
      )
      try {
        const base = { dir: cwd, repo: override, signal: controller.signal }
        const payload =
          tab === 'issues'
            ? await api.issues({ ...base, state: issueState, filter: issueFilter })
            : tab === 'pulls'
              ? await api.pulls({ ...base, state: issueState })
              : await api.notifications({ ...base, all: false })
        if (controller.signal.aborted) return
        const key = tab === 'notifications' ? notificationKey : issueKey
        setList(previous => ({
          phase: 'ready',
          items: append ? mergePage(previous.items, payload.items, key) : payload.items,
          hasMore: payload.hasMore,
          page,
        }))
      } catch (error) {
        if (controller.signal.aborted) return
        setList(previous => ({ ...previous, phase: 'error', error }))
      }
    },
    [api, cwd, override, ready, tab, issueState, issueFilter],
  )

  React.useEffect(() => {
    setDetail(null)
    setCreateOpen(false)
    setWriteError(undefined)
    loadList()
  }, [loadList])

  const openItem = React.useCallback(
    async item => {
      if (tab === 'notifications') {
        if (typeof window !== 'undefined' && item.webUrl !== '') window.open(item.webUrl, '_blank', 'noopener')
        return
      }
      const kind = tab === 'pulls' ? 'pull' : 'issue'
      setWriteError(undefined)
      setDetail({ phase: 'loading', kind, number: item.number })
      try {
        const value = await api.item({ dir: cwd, repo: override, kind, number: item.number })
        setDetail({ phase: 'ready', ...value })
      } catch (error) {
        setDetail({ phase: 'error', error, kind, number: item.number })
      }
    },
    [api, cwd, override, tab],
  )

  const reloadDetail = React.useCallback(async () => {
    if (detail === null || detail.number === undefined) return
    try {
      const value = await api.item({ dir: cwd, repo: override, kind: detail.kind, number: detail.number })
      setDetail({ phase: 'ready', ...value })
    } catch (error) {
      setDetail(previous => (previous === null ? previous : { ...previous, error }))
    }
  }, [api, cwd, override, detail])

  const runWrite = React.useCallback(
    async (action, fields = {}) => {
      setBusy(true)
      setWriteError(undefined)
      try {
        const payload = actionPayload(action, fields)
        await api.action({ dir: cwd, repo: override, ...payload })
        await reloadDetail()
        await loadList({ page: 1 })
      } catch (error) {
        setWriteError(errorText(t, error))
        throw error
      } finally {
        setBusy(false)
      }
    },
    [api, cwd, override, reloadDetail, loadList, t],
  )

  const importToken = React.useCallback(async () => {
    setImporting(true)
    setAuthNotice(undefined)
    try {
      const result = await api.importGh()
      setAuthNotice({ kind: 'ok', login: result.login, scopes: result.scopes })
      await refreshAuth()
      await refreshContext()
    } catch (error) {
      setAuthNotice({ kind: 'error', error })
    } finally {
      setImporting(false)
    }
  }, [api, refreshAuth, refreshContext])

  const applyManualRepo = React.useCallback(() => {
    const value = manualDraft.trim()
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(value)) return
    setRepoOverride(value)
    setManualDraft('')
  }, [manualDraft])

  // ---- render -----------------------------------------------------------

  if (cwd === undefined && override === undefined) {
    if (sessionsPending) return React.createElement(Spinner, { label: t('panel.loading') })
    return React.createElement(EmptyState, { title: t('panel.noSessionDir') })
  }

  if (auth.phase === 'ready' && auth.configured === false) {
    return React.createElement(AuthCard, {
      t,
      auth,
      notice: authNotice,
      importing,
      onImport: importToken,
    })
  }

  if (context.phase === 'error') {
    const code = context.error?.code
    const manual = code === 'no_remote' || code === 'not_github'
    return React.createElement(
      'div',
      { className: 'dgh-panel' },
      React.createElement(ErrorCard, {
        message: errorText(t, context.error),
        hint: manual ? t('repo.manualLabel') : undefined,
        actionLabel: manual ? t('repo.manualOpen') : t('panel.retry'),
        onAction: manual ? () => setContext({ phase: 'empty' }) : refreshContext,
      }),
    )
  }

  if (context.phase === 'empty') {
    return React.createElement(
      'div',
      { className: 'dgh-panel' },
      React.createElement(ManualRepoForm, {
        t,
        open: true,
        draft: manualDraft,
        onChange: setManualDraft,
        onApply: applyManualRepo,
      }),
    )
  }

  if (context.phase !== 'ready') {
    return React.createElement('div', { className: 'dgh-panel' }, React.createElement(Spinner, { label: t('panel.loading') }))
  }

  const repo = context.repo

  const tabs = TABS.map(id => ({ id, label: t(`tabs.${id}`) }))

  const filterItems =
    tab === 'notifications'
      ? []
      : [
          { id: 'open', label: t('filter.open') },
          { id: 'closed', label: t('filter.closed') },
        ]

  return React.createElement(
    'div',
    { className: 'dgh-panel' },
    React.createElement(RepoHeader, { repo, viewer: context.viewer, t, language }),
    React.createElement(
      'div',
      { className: 'dgh-meta-row' },
      React.createElement(IconButton, {
        label: t('panel.refresh'),
        onClick: () => {
          refreshContext()
          loadList()
          if (detail !== null) reloadDetail()
        },
        children: React.createElement(RefreshIcon, { size: 13 }),
      }),
      React.createElement(IconButton, {
        label: t('panel.openInBrowser'),
        onClick: () => window.open(repo.webUrl, '_blank', 'noopener'),
        children: React.createElement(ExternalIcon, { size: 13 }),
      }),
      React.createElement('span', { className: 'dgh-spacer' }),
      tab === 'issues'
        ? React.createElement(
            Button,
            { variant: 'ghost', onClick: () => setCreateOpen(value => !value) },
            t('create.action'),
          )
        : null,
    ),

    createOpen
      ? React.createElement(
          'div',
          { className: 'dgh-form' },
          React.createElement(TextInput, {
            value: createTitle,
            onChange: setCreateTitle,
            placeholder: t('create.titlePlaceholder'),
            label: t('create.titlePlaceholder'),
            disabled: busy,
          }),
          React.createElement(TextArea, {
            value: createBody,
            onChange: setCreateBody,
            placeholder: t('create.bodyPlaceholder'),
            label: t('create.bodyPlaceholder'),
            rows: 3,
            disabled: busy,
          }),
          React.createElement(
            'div',
            { className: 'dgh-form-actions' },
            React.createElement(
              Button,
              {
                variant: 'ghost',
                onClick: () => {
                  setCreateOpen(false)
                  setCreateTitle('')
                  setCreateBody('')
                },
                disabled: busy,
              },
              t('create.cancel'),
            ),
            React.createElement(
              Button,
              {
                variant: 'primary',
                disabled: busy || createTitle.trim() === '',
                onClick: async () => {
                  try {
                    await runWrite('create-issue', { title: createTitle, body: createBody })
                    setCreateOpen(false)
                    setCreateTitle('')
                    setCreateBody('')
                  } catch {
                    // The panel rendered the failure; the form keeps its text.
                  }
                },
              },
              t('create.submit'),
            ),
          ),
        )
      : null,

    detail !== null
      ? React.createElement(DetailSwitch, {
          detail,
          t,
          language,
          busy,
          writeError,
          onBack: () => {
            setDetail(null)
            setWriteError(undefined)
          },
          onComment: body => runWrite('comment', { number: detail.number, body }),
          onAction: action => runWrite(action, { number: detail.number }),
          onRetry: reloadDetail,
        })
      : React.createElement(
          React.Fragment,
          null,
          React.createElement(Segmented, {
            items: tabs,
            value: tab,
            onChange: setTab,
            label: t('tab.title'),
          }),
          filterItems.length === 0
            ? null
            : React.createElement(Segmented, {
                items: filterItems,
                value: issueState,
                onChange: setIssueState,
                label: t('tabs.issues'),
              }),
          tab === 'issues'
            ? React.createElement(Segmented, {
                items: [
                  { id: 'all', label: t('filter.all') },
                  { id: 'assigned', label: t('filter.assigned') },
                  { id: 'created', label: t('filter.created') },
                ],
                value: issueFilter,
                onChange: setIssueFilter,
                label: t('filter.assigned'),
              })
            : null,
          list.phase === 'loading'
            ? React.createElement(Spinner, { label: t('panel.loading') })
            : list.phase === 'error'
              ? React.createElement(ErrorCard, {
                  message: errorText(t, list.error),
                  actionLabel: t('panel.retry'),
                  onAction: () => loadList(),
                })
              : React.createElement(ListView, {
                  tab,
                  items: list.items,
                  hasMore: list.hasMore,
                  loadingMore: list.phase === 'more',
                  language,
                  t,
                  onOpen: openItem,
                  onLoadMore: () => loadList({ page: list.page + 1, append: true }),
                }),
        ),
  )
}

/**
 * The detail pane, including its own failure and loading states.
 *
 * @param {object} props detail props.
 * @returns {React.ReactElement} the pane.
 */
function DetailSwitch({ detail, t, language, busy, writeError, onBack, onComment, onAction, onRetry }) {
  if (detail.phase === 'loading') return React.createElement(Spinner, { label: t('panel.loading') })
  if (detail.phase === 'error') {
    return React.createElement(
      'div',
      { className: 'dgh-detail' },
      React.createElement(Button, { variant: 'ghost', onClick: onBack }, t('detail.back')),
      React.createElement(ErrorCard, {
        message: errorText(t, detail.error),
        actionLabel: t('panel.retry'),
        onAction: onRetry,
      }),
    )
  }
  return React.createElement(ItemDetail, {
    detail,
    language,
    t,
    busy,
    error: writeError,
    onBack,
    onComment,
    onAction,
  })
}

/**
 * The setup card shown while no token is configured.
 *
 * @param {object} props card props.
 * @returns {React.ReactElement} the card.
 */
function AuthCard({ t, auth, notice, importing, onImport }) {
  return React.createElement(
    'div',
    { className: 'dgh-panel' },
    React.createElement(
      'div',
      { className: 'dgh-auth' },
      React.createElement('h2', { className: 'dgh-auth-title' }, t('auth.title')),
      React.createElement('p', { className: 'dgh-auth-body' }, t('auth.body')),
      React.createElement('code', { className: 'dgh-code' }, t('auth.envHint')),
      React.createElement(
        'div',
        { className: 'dgh-meta-row' },
        React.createElement(
          Button,
          { variant: 'primary', onClick: onImport, disabled: importing || auth.importable === false },
          importing ? t('auth.importing') : t('auth.import'),
        ),
      ),
      notice === undefined
        ? null
        : notice.kind === 'ok'
          ? React.createElement(
              'div',
              null,
              React.createElement('p', { className: 'dgh-error-hint' }, t('auth.imported', { login: notice.login })),
              Array.isArray(notice.scopes) && notice.scopes.length > 0
                ? React.createElement(
                    'p',
                    { className: 'dgh-error-hint' },
                    t('auth.scopes', { scopes: notice.scopes.join(', ') }),
                  )
                : null,
              Array.isArray(notice.scopes) && !notice.scopes.includes('repo')
                ? React.createElement('p', { className: 'dgh-error-message' }, t('auth.scopesMissing'))
                : null,
            )
          : React.createElement('p', { className: 'dgh-error-message' }, errorText(t, notice.error)),
    ),
  )
}

/**
 * The hand-typed repository field.
 *
 * @param {object} props form props.
 * @returns {React.ReactElement | null} the form, when open.
 */
function ManualRepoForm({ t, open, draft, onChange, onApply }) {
  if (!open) return null
  return React.createElement(
    'div',
    { className: 'dgh-form' },
    React.createElement(TextInput, {
      value: draft,
      onChange,
      placeholder: 'owner/repo',
      label: t('repo.manualLabel'),
    }),
    React.createElement(
      'div',
      { className: 'dgh-form-actions' },
      React.createElement(Button, { variant: 'primary', onClick: onApply, disabled: draft.trim() === '' }, t('repo.manualApply')),
    ),
  )
}
