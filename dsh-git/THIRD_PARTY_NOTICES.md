# Third-party notices — `@litingyes/dsh-git`

## Git logo (package icon and sidebar mark)

`icon.svg` is the Git logo, distributed by the [devicon](https://github.com/devicons/devicon)
project (MIT licensed) as `icons/git/git-original.svg`, and used here unmodified.

The Git logo is a trademark of the Git project. The artwork was created by
Jason Long and is licensed under
[Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/);
see <https://git-scm.com/downloads/logos>. Redistribution keeps that attribution.

## Base UI

The browser half is bundled from [`@base-ui-components/react`](https://base-ui.com)
1.0.0-rc.0, © The Base UI Authors, MIT licensed. It is compiled into `client.js`
together with its transitive dependencies (`@floating-ui/*`, `reselect`,
`tabbable`, `use-sync-external-store`, `@babel/runtime`), all MIT licensed.

React and React DOM are **not** bundled: they are resolved at runtime from the
Harness Web UI's shared module table.

## esbuild

`scripts/build-client.mjs` uses [esbuild](https://esbuild.github.io), MIT
licensed. It is a build-time dependency only and ships no code into the bundle.
