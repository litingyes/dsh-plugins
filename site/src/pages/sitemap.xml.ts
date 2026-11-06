import type { APIRoute } from 'astro'
import { plugins } from '../data/plugins'
import { url } from '../lib/i18n'
import type { Locale } from '../lib/types'

const locales: Locale[] = ['zh', 'en']

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://dsh-plugins.vercel.app')
  const paths = ['', ...plugins.map((plugin) => `plugins/${plugin.slug}`)]

  const urls = paths
    .map((path) => {
      const alternates = locales
        .map(
          (locale) =>
            `    <xhtml:link rel="alternate" hreflang="${locale === 'zh' ? 'zh-CN' : 'en'}" href="${new URL(url(locale, path), origin).href}" />`,
        )
        .join('\n')
      return locales
        .map((locale) => {
          const href = new URL(url(locale, path), origin).href
          return `  <url>\n    <loc>${href}</loc>\n${alternates}\n  </url>`
        })
        .join('\n')
    })
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
