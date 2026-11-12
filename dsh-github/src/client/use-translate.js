/**
 * Live translator hook for the panel.
 *
 * The Client locale service publishes language changes; the panel subscribes
 * here instead of freezing the language read at mount, so switching the
 * interface language repaints the tab chip and every row.
 *
 * @module @litingyes/dsh-github/client/use-translate
 */

import * as React from 'react'
import { resolveLanguage, translate } from './i18n.js'

/**
 * Resolve `t` and the active language, re-rendering when the language changes.
 *
 * @param {object | undefined} locale the Client locale service.
 * @returns {{t: (key: string, vars?: object) => string, language: 'zh'|'en'}} translator.
 */
export function useTranslate(locale) {
  const [version, bump] = React.useReducer(count => count + 1, 0)
  React.useEffect(() => {
    if (typeof locale?.subscribe !== 'function') return undefined
    return locale.subscribe(() => bump())
  }, [locale])
  const language = resolveLanguage(locale)
  // `version` participates so a language switch produces a new translator.
  const t = React.useCallback((key, vars) => translate(language, key, vars), [language, version])
  return { t, language }
}
