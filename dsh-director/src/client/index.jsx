/**
 * `@litingyes/dsh-director` browser half.
 *
 * Registers one right-Sidebar tab type, its body and its chip title. The body
 * follows the Session on screen: it resolves that Session's working directory
 * and reads `/dsh-director/api/state?dir=…` from the Host, which is where the
 * project/storyboard/audio files and the review come from.
 *
 * The plugin also uses the conversation's tool cards, but the board is the
 * surface this half adds. Everything here is read-only by design: mutations run
 * through the agent tools, so the panel can never race a version-guarded write.
 *
 * @module @litingyes/dsh-director/client
 */

import * as React from 'react'
import { DirectorPanel } from './panel.jsx'
import { CSS } from './styles.js'
import { DICTIONARIES, NS, resolveLanguage, translate } from './i18n.js'
import { createDirectorApi } from './api-client.js'
import { createDirectorStores } from './store.js'
import { DirectorGuideIcon, DirectorMark } from './icons.jsx'

/** This implementation's identity in the right Sidebar's tab registry. */
const TAB_ID = '@litingyes/dsh-director'

/** The discriminator the guide's add control opens a tab by. */
const TAB_KIND = 'dsh-director'

/** Services the client half needs. */
export const inject = ['slots', 'locale']

/** Package name; also the id the module loader registered this factory under. */
export const name = 'dsh-director'

/**
 * The right Sidebar tab chip.
 *
 * @param {{ useTabInfo: () => { tab: { title: string } } }} props chip props.
 * @returns {React.ReactElement} chip content.
 */
export function DirectorTabTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(DirectorMark, { size: 14, className: 'ddr-title-icon' }),
    tab.title,
  )
}

/**
 * The tab type's registry declaration.
 *
 * `order` keeps it next to the shipped workspace pages in the guide.
 *
 * @param {(key: string) => string} t namespace-bound translate.
 * @returns {object} declaration accepted by `ctx.sidebarRightTabs.register`.
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
        order: 22,
        title: () => t('guide.title'),
        description: () => t('guide.description'),
        icon: DirectorGuideIcon,
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
  const api = createDirectorApi()
  const stores = createDirectorStores(api)
  const locale = ctx.locale
  const t = key => translate(resolveLanguage(locale), key)

  ctx.effect(() => locale.register(NS, DICTIONARIES), 'dsh-director: dictionaries')

  // A style element owned by this plugin: removing the effect removes the rules.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = '@litingyes/dsh-director'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'dsh-director: styles')

  /** The panel, bound to the Session whose right Sidebar holds this tab. */
  function DirectorTabBody(props) {
    return React.createElement(DirectorPanel, {
      stores,
      locale,
      sessionId: props?.sessionId,
      useSessions: props?.useSessions,
    })
  }

  // Every registration below lives exactly as long as the tab registry exists.
  ctx.inject(['sidebarRightTabs'], scoped => {
    scoped.effect(
      () => scoped.sidebarRightTabs.register(tabDefinition(t)),
      'dsh-director: right sidebar tab type',
    )

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register(
            { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
            DirectorTabBody,
          ),
        ),
      'dsh-director: right sidebar tab body',
    )

    scoped.effect(
      () =>
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register(
            { name: 'sidebar.right.pane.tab.title', key: TAB_ID },
            DirectorTabTitle,
          ),
        ),
      'dsh-director: right sidebar tab title',
    )
  })
}
