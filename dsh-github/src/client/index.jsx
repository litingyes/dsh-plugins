/**
 * `@litingyes/dsh-github` browser half.
 *
 * One surface: the **right Sidebar tab**, which belongs to the Session on
 * screen — so the repository it shows is that Session's workspace and the panel
 * moves with the conversation instead of sitting beside it. Three registrations
 * make it reachable, in the order the right Sidebar's own contract asks for:
 *
 *   - `ctx.sidebarRightTabs.register(...)` declares the tab *type* — its id, its
 *     kind, its chip title, and the guide card that opens it;
 *   - `sidebar.right.pane.tab` (keyed by that same id) draws the body;
 *   - `sidebar.right.pane.tab.title` draws the chip, so the label follows the
 *     language preference live instead of freezing the title captured at open.
 *
 * `sidebarRightTabs` belongs to `@deepseek-ai/dsh-client-ui-sidebar-right`, so
 * the tab is registered through `ctx.inject`: a composition without that package
 * simply has no place to put this panel and must not fail to mount.
 *
 * The bundle is built from these sources by `scripts/build-client.mjs`; it
 * imports nothing but React, React DOM and the JSX runtime.
 *
 * @module @litingyes/dsh-github/client
 */

import * as React from 'react'
import { GithubPanel } from './panel.jsx'
import { RepoIcon } from './icons.jsx'
import { CSS } from './styles.js'
import { DICTIONARIES, NS, resolveLanguage, translate } from './i18n.js'
import { createGithubApi } from './api-client.js'

/** This implementation's identity in the right Sidebar's tab registry. */
const TAB_ID = '@litingyes/dsh-github'

/** The discriminator the guide's add control opens a tab by. */
const TAB_KIND = 'dsh-github'

/** Services the client half needs unconditionally. */
export const inject = ['slots', 'locale']

/** Package name; also the id the module loader registered this factory under. */
export const name = 'dsh-github'

/**
 * The right Sidebar tab chip.
 *
 * @param {{useTabInfo: () => {tab: {title: string}}}} props chip props.
 * @returns {React.ReactElement} the chip content.
 */
export function GithubTabTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(RepoIcon, { size: 14, className: 'dgh-title-icon' }),
    tab.title,
  )
}

/**
 * The guide card's icon.
 *
 * @param {{size?: number}} props icon props.
 * @returns {React.ReactElement} the glyph.
 */
function GithubGuideIcon(props) {
  return React.createElement(RepoIcon, { size: props?.size ?? 20 })
}

/**
 * The tab type's registry declaration.
 *
 * A page type: it recognizes no resource address, because a repository is not
 * something another surface links to, and the guide card is the only way in.
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
        order: 30,
        title: () => t('guide.title'),
        description: () => t('guide.description'),
        icon: GithubGuideIcon,
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
  const api = createGithubApi()
  const locale = ctx.locale
  const t = key => translate(resolveLanguage(locale), key)

  ctx.effect(() => locale.register(NS, DICTIONARIES), 'dsh-github: dictionaries')

  // A style element owned by this plugin: removing the effect removes the rules.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = '@litingyes/dsh-github'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'dsh-github: styles')

  /** The panel, bound to the Session whose right Sidebar holds this tab. */
  function GithubTabBody(props) {
    return React.createElement(GithubPanel, {
      api,
      locale,
      sessionId: props?.sessionId,
      useSessions: props?.useSessions,
    })
  }

  // Every registration below lives exactly as long as the tab registry exists.
  ctx.inject(['sidebarRightTabs'], scoped => {
    scoped.effect(() => scoped.sidebarRightTabs.register(tabDefinition(t)), 'dsh-github: right sidebar tab type')

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, GithubTabBody),
        ),
      'dsh-github: right sidebar tab body',
    )

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, GithubTabTitle),
        ),
      'dsh-github: right sidebar tab title',
    )
  })
}
