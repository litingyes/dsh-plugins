/**
 * Small formatting helpers shared by the views.
 *
 * @module @litingyes/dsh-git/client/format
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Render one ISO timestamp as a short absolute date-time.
 *
 * @param {string} iso ISO 8601 timestamp from git.
 * @returns {string} `YYYY-MM-DD HH:MM`, or the raw value when unparsable.
 */
export function absoluteTime(iso) {
  if (typeof iso !== 'string' || iso === '') return ''
  const at = iso.indexOf('T')
  if (at === 10) return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
  return iso
}

/**
 * Render one ISO timestamp relative to now.
 *
 * @param {string} iso ISO 8601 timestamp from git.
 * @param {'zh'|'en'} language active language.
 * @param {number} [now] reference time in epoch milliseconds (tests).
 * @returns {string} relative label, falling back to the absolute date.
 */
export function relativeTime(iso, language, now = Date.now()) {
  if (typeof iso !== 'string' || iso === '') return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  const delta = Math.max(0, now - at)
  const zh = language === 'zh'

  if (delta < MINUTE) return zh ? '刚刚' : 'just now'
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE)
    return zh ? `${minutes} 分钟前` : `${minutes} min ago`
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR)
    return zh ? `${hours} 小时前` : `${hours} h ago`
  }
  if (delta < 2 * DAY) return zh ? '昨天' : 'yesterday'
  if (delta < 30 * DAY) {
    const days = Math.floor(delta / DAY)
    return zh ? `${days} 天前` : `${days} d ago`
  }
  return absoluteTime(iso).slice(0, 10)
}

/**
 * Split a repository path into its directory part and file name.
 *
 * @param {string} value path.
 * @returns {{dir: string, base: string}} the two halves.
 */
export function splitPath(value) {
  const path = typeof value === 'string' ? value : ''
  const cut = path.lastIndexOf('/')
  if (cut === -1) return { dir: '', base: path }
  return { dir: `${path.slice(0, cut + 1)}`, base: path.slice(cut + 1) }
}

/**
 * Render a status letter for display.
 *
 * @param {string} status one porcelain status letter.
 * @returns {string} the single letter shown in the chip.
 */
export function statusLetter(status) {
  if (typeof status !== 'string' || status === '') return '?'
  const letter = status[0].toUpperCase()
  return letter === '.' ? '?' : letter
}
