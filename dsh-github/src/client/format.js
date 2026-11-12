/**
 * Pure formatting helpers for the panel.
 *
 * Kept apart from the components so the parts that are easy to get wrong — a
 * timestamp boundary, a duplicate on a second page, an action payload — are
 * testable without a DOM.
 *
 * @module @litingyes/dsh-github/client/format
 */

/** Seconds per unit, largest first; used by `relativeTime`. */
const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/**
 * Render an ISO timestamp relative to now, in the reader's language.
 *
 * @param {string} iso timestamp from the Host.
 * @param {{now?: number, language?: 'zh'|'en'}} [options] clock and language.
 * @returns {string} e.g. `3 天前` / `3 days ago`, or `''` for an unparseable value.
 */
export function relativeTime(iso, options = {}) {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return ''
  const now = options.now ?? Date.now()
  const language = options.language === 'zh' ? 'zh-CN' : 'en'
  const seconds = (parsed - now) / 1000
  const magnitude = Math.abs(seconds)
  if (magnitude < 60) {
    return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.round(seconds), 'second')
  }
  for (const [unit, size] of UNITS) {
    if (magnitude >= size) {
      return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.round(seconds / size), unit)
    }
  }
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.round(seconds / 60), 'minute')
}

/**
 * Render a count the way the panel's chips do.
 *
 * @param {number} value count.
 * @param {'zh'|'en'} [language] language.
 * @returns {string} grouped digits.
 */
export function formatCount(value, language = 'en') {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en').format(number)
}

/**
 * Append one page to what is already on screen, without duplicates.
 *
 * GitHub returns the same item again when something moves between requests, so
 * a list that simply concatenated would show it twice.
 *
 * @param {object[]} previous items already rendered.
 * @param {object[]} incoming next page.
 * @param {(item: object) => string|number} keyOf stable identity.
 * @returns {object[]} the merged list.
 */
export function mergePage(previous, incoming, keyOf) {
  const seen = new Set(previous.map(keyOf))
  const merged = [...previous]
  for (const item of incoming) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

/** Issue and pull request identity is the number. */
export const issueKey = item => `#${item.number}`

/** Notification identity is its id. */
export const notificationKey = item => String(item.id)

/**
 * Stable colour for a label without one, so the same label keeps its chip
 * colour across renders and across sessions.
 *
 * @param {string} name label name.
 * @returns {string} an `hsl()` colour.
 */
export function labelColor(name, fallback = '') {
  if (typeof fallback === 'string' && /^[0-9a-fA-F]{6}$/u.test(fallback)) return `#${fallback}`
  // FNV-1a over the whole name, then one hue. Folding the hash modulo the
  // circle on every character (the obvious shortcut) collides on short common
  // labels — "bug" and "enhancement" land on the same hue — while keeping the
  // full 32 bits before the modulo separates them.
  let hash = 0x811c9dc5
  const text = String(name ?? '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const hue = (hash >>> 0) % 360
  return `hsl(${hue} 62% 45%)`
}
