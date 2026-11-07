/**
 * The published plugin directories, shared by every release script.
 *
 * `release.mjs` tags a package and `check-release.mjs` proves the tag exists, so
 * both must agree on the list and the tag naming. Keeping them here means a new
 * plugin is added in one place instead of silently escaping the gate.
 */

/** Plugin directories that ship to npm, in the order the docs list them. */
export const PACKAGES = ['dsh-context7', 'dsh-git']

/**
 * The only tag name `.github/workflows/publish.yml` publishes from.
 *
 * @param {string} dir plugin directory, e.g. `dsh-git`.
 * @param {string} version manifest version, e.g. `0.5.1`.
 * @returns {string} e.g. `dsh-git-v0.5.1`.
 */
export function tagName(dir, version) {
  return `${dir}-v${version}`
}

/**
 * Human-facing package name for a directory, read from its manifest.
 *
 * @param {string} dir plugin directory.
 * @param {Record<string, unknown>} manifest that package's parsed `package.json`.
 * @returns {string} e.g. `@litingyes/dsh-git`.
 */
export function packageName(dir, manifest) {
  return typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : `@litingyes/${dir}`
}
