/**
 * Pure formatting helpers for the director board. No React, so the tests can
 * exercise them directly.
 *
 * @module @litingyes/dsh-director/client/format
 */

/**
 * Seconds as `4s` / `3.5s`.
 *
 * @param {number} value seconds.
 * @returns {string} label.
 */
export function formatSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) return '0s'
  return `${Math.round(value * 10) / 10}s`
}

/** Seconds as `mm:ss`, for audio positions. */
export function formatClock(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const total = Math.round(value)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Keep a single-line preview short.
 *
 * @param {unknown} value raw text.
 * @param {number} max characters.
 * @returns {string} clipped text.
 */
export function clip(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * A status's dictionary key, including unknown values.
 *
 * @param {string} status shot status.
 * @returns {string} dictionary key.
 */
export function statusKey(status) {
  const known = ['planned', 'prompt_ready', 'generating', 'generated', 'selected', 'dropped']
  return known.includes(status) ? `status.${status}` : 'status.other'
}

/**
 * A scene purpose's dictionary key.
 *
 * @param {string} purpose scene purpose.
 * @returns {string | null} dictionary key, or null when unset.
 */
export function purposeKey(purpose) {
  const known = ['hook', 'setup', 'turn', 'payoff', 'cta']
  return known.includes(purpose) ? `purpose.${purpose}` : null
}

/** A finding code's dictionary key. */
export function reviewCodeKey(code) {
  return `review.code.${code ?? 'OTHER'}`
}

/**
 * The `<dir>/<root>` label shown in the header, shortened from the middle when
 * it does not fit.
 *
 * @param {string} dir Session working directory.
 * @param {string} root configured production root.
 * @param {number} [max] characters.
 * @returns {string} label.
 */
export function productionPath(dir, root, max = 64) {
  const full = `${String(dir ?? '').replace(/[/\\]+$/u, '')}/${root}`
  if (full.length <= max) return full
  const keep = Math.max(8, Math.floor((max - 1) / 2))
  return `${full.slice(0, keep)}…${full.slice(-keep)}`
}

/**
 * Count the shots and planned seconds of one scene, for its header.
 *
 * @param {object} scene scene from storyboard.json.
 * @returns {{ shots: number, seconds: number }} totals.
 */
export function sceneTotals(scene) {
  const shots = Array.isArray(scene?.shots) ? scene.shots : []
  let seconds = 0
  for (const shot of shots) {
    if (Number.isFinite(shot.durationSec)) seconds += shot.durationSec
  }
  return { shots: shots.length, seconds: Math.round(seconds * 10) / 10 }
}

/** The first selected take of a shot, or null. */
export function selectedTake(shot) {
  const takes = Array.isArray(shot?.takes) ? shot.takes : []
  return takes.find(take => take.selected === true) ?? null
}
