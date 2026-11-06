# dsh-plugins site

The public portal for [`dsh-plugins`](../README.md): what each DeepSeek Harness
plugin adds, for the agent and for the person. Static output, no client
framework, two locales.

- **Stack:** Astro 7, Tailwind CSS 4 (Vite plugin), Fontsource faces. No React,
  no MDX, no content collections: two plugins do not need a CMS.
- **Design:** Hallmark v2.0.0, Console theme (graphite). Tokens live in
  `src/styles/tokens.css`; the stamp, critique line and waivers sit at the top of
  `src/styles/global.css`.
- **Data:** the commit graph is this repository's own history, laid out by the
  plugin's own `dsh-git/src/shared/graph.js`, frozen into
  `src/data/repo-graph.json` together with `src/data/plugins-meta.json` (read from
  each plugin's `package.json`). Both files are committed so a deploy never needs
  git history.

## Commands

```sh
pnpm install
pnpm sync      # regenerate src/data/*.json from git, then commit them
pnpm dev       # http://localhost:4321
pnpm build     # -> dist/
pnpm preview   # serve dist/
pnpm check     # data freshness, internal links, token contrast
```

Run `pnpm sync` after commits land on `release`; `pnpm check` fails when the
committed graph no longer covers the checked-out HEAD.

## Layout

```text
src/
├── data/plugins.ts        all copy, both locales, one entry per plugin
├── data/repo-graph.json   generated: commits, lane rows, details, branches
├── data/plugins-meta.json generated: name, version, DSH range per plugin
├── lib/i18n.ts            zh at /, en at /en; one URL helper
├── styles/                tokens.css, base.css, global.css (stamp first)
├── components/            nav, footer, commit graph, install command, ...
├── layouts/Base.astro     head, hreflang, skip link, script slots
└── pages/                 index, plugins/[slug], en/*, 404, sitemap.xml.ts
```

The hero and the dsh-git page show the panel's commit graph from
`repo-graph.json`. It is a preview rebuilt from real data inside a `data-slot`,
not a screenshot: the running Harness is auth-gated and shows private sessions.

## Deploying on Vercel

The repository itself needs no deploy configuration (no workflow, no
`vercel.json`). In the Vercel project:

| Setting | Value |
| --- | --- |
| Root Directory | `site` |
| Framework Preset | Astro (detected) |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Node.js Version | 22.23.4 or newer |

Canonical URLs come from `SITE_URL` when set, otherwise they default to
`https://dsh-plugins.vercel.app`. Set `SITE_URL` when a custom domain is in use.

If the Vercel build image cannot resolve the pinned `packageManager` pnpm
version, drop that field from `package.json` and let Vercel pick its own pnpm.

## Third parties

Icons belong to their projects: the Git logo (Jason Long, CC BY 3.0, via
devicon) and the Context7 file icon (vscode-icons, MIT). Fonts: Host Grotesk and
Atkinson Hyperlegible Mono, SIL Open Font License. Code: MIT, like the
repository.
