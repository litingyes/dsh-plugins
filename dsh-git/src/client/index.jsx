/**
 * `@litingyes/dsh-git` browser half.
 *
 * The panel is a **right Sidebar tab**, not a main panel: it belongs to the
 * Session on screen, so the repository it shows is that Session's workspace and
 * it moves with the conversation instead of sitting beside it. Three
 * registrations make that reachable, in the order the right Sidebar's own
 * contract asks for:
 *   - `ctx.sidebarRightTabs.register(...)` declares the tab *type* — its id,
 *     its kind, its chip title, and the guide card that opens it;
 *   - `sidebar.right.pane.tab` (keyed by that same id) draws the body;
 *   - `sidebar.right.pane.tab.title` draws the chip, so the label follows the
 *     language preference live instead of freezing the title captured at open.
 *
 * The tab body takes no workspace id: the right Sidebar hands every session
 * slot its `sessionId`, and the panel resolves that Session's working directory
 * through `useSessions`.
 *
 * `sidebarRightTabs` belongs to `@deepseek-ai/dsh-client-ui-sidebar-right`, so
 * the tab is registered through `ctx.inject`: a composition without that
 * package simply has no place to put this panel and must not fail to mount.
 *
 * @module @litingyes/dsh-git/client
 */

import * as React from 'react'
import { GitPanel } from './panel.jsx'
import { GitGuideIcon, GitMark } from './icons.jsx'
import { CSS } from './styles.js'
import { DICTIONARIES, NS, resolveLanguage, translate } from './i18n.js'
import { createGitApi } from './api-client.js'

/** This implementation's identity in the right Sidebar's tab registry. */
const TAB_ID = '@litingyes/dsh-git'

/** The discriminator the guide's add control opens a tab by. */
const TAB_KIND = 'dsh-git'

/** Services the client half needs unconditionally. */
export const inject = ['slots', 'locale']

/** Package name; also the id the module loader registered this factory under. */
export const name = 'dsh-git'

/**
 * The right Sidebar tab chip.
 *
 * `useTabInfo` is the tab's framework-bound reader; `tab.title` is the text
 * captured when the tab opened, so the chip keeps a stable name while the mark
 * identifies the plugin.
 *
 * @param {{useTabInfo: () => {tab: {title: string}}}} props chip props.
 * @returns {React.ReactElement} the chip content.
 */
export function GitTabTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(GitMark, { size: 14, className: 'dgit-title-icon' }),
    tab.title,
  )
}

/**
 * The tab type's registry declaration.
 *
 * A page type: it recognizes no resource address, because a repository is not
 * something another surface links to, and the guide card is the only way in.
 * `order` keeps it next to the shipped workspace pages in the guide.
 *
 * @param {(key: string) => string} t namespace-bound translate.
 * @returns {object} the definition `ctx.sidebarRightTabs.register` accepts.
 */
export function tabDefinition(t) {
  return {
    id: TAB_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => t('tab.title'),
    guide: [
      {
        id: 'workspace',
        order: 20,
        title: () => t('guide.title'),
        description: () => t('guide.description'),
        icon: GitGuideIcon,
      },
    ],
  }
}

/**
 * Register the client half.
 *
 * @param {object} ctx Client root context.
 */
export function apply(ctx) {
  const api = createGitApi()
  const locale = ctx.locale
  const t = key => translate(resolveLanguage(locale), key)

  ctx.effect(() => locale.register(NS, DICTIONARIES), 'dsh-git: dictionaries')

  // A style element owned by this plugin: removing the effect removes the rules.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = '@litingyes/dsh-git'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'dsh-git: styles')

  /** The panel, bound to the Session whose right Sidebar holds this tab. */
  function DshGitTabBody(props) {
    return React.createElement(GitPanel, {
      api,
      locale,
      sessionId: props?.sessionId,
      useSessions: props?.useSessions,
    })
  }

  // Every registration below lives exactly as long as the tab registry exists.
  ctx.inject(['sidebarRightTabs'], scoped => {
    scoped.effect(
      () => scoped.sidebarRightTabs.register(tabDefinition(t)),
      'dsh-git: right sidebar tab type',
    )

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register(
            { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
            DshGitTabBody,
          ),
        ),
      'dsh-git: right sidebar tab body',
    )

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register(
            { name: 'sidebar.right.pane.tab.title', key: TAB_ID },
            GitTabTitle,
          ),
        ),
      'dsh-git: right sidebar tab title',
    )
  })
}
