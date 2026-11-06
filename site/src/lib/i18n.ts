import type { Locale } from './types'

export const locales: Locale[] = ['zh', 'en']
export const defaultLocale: Locale = 'zh'

/**
 * Build an internal URL. Chinese lives at the root, English under /en, and
 * every route is directory-style so the Vercel deploy and the dev server agree.
 */
export function url(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  const prefix = locale === defaultLocale ? '' : `/${locale}`
  if (clean === '') return `${prefix}/`
  return `${prefix}/${clean}/`
}

/** The same page in the other locale. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh'
}

/** `<html lang>` and og:locale values. */
export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

export function ogLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh_CN' : 'en_US'
}

/** Resolve both values of an `L` for the active locale. */
export function pick(locale: Locale, value: { zh: string; en: string }): string {
  return value[locale]
}
