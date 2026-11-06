import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

/**
 * Canonical origin. Vercel exposes the production host through the environment,
 * so a deploy gets the right sitemap and canonical URLs without configuration;
 * `SITE_URL` overrides it for a custom domain or a local check.
 */
const site = process.env.SITE_URL ?? 'https://dsh-plugins.vercel.app'

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
})
