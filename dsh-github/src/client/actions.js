/**
 * Pure helpers behind the panel's buttons.
 *
 * The panel is not allowed to invent a write: a click becomes one of the five
 * actions `api.js` accepts, and an empty field is refused here rather than
 * travelling to GitHub as an empty comment.
 *
 * @module @litingyes/dsh-github/client/actions
 */

/** Actions whose effect is not undone by clicking the opposite button. */
const DESTRUCTIVE = new Set(['merge', 'close'])

/** Every code the Host can answer with, so an unknown one is visible as such. */
export const KNOWN_ERRORS = new Set([
  'no_token',
  'invalid_token',
  'no_remote',
  'not_github',
  'rate_limited',
  'not_found',
  'network',
  'not_mergeable',
  'gh_missing',
  'gh_not_logged_in',
  'writes_disabled',
  'bad_request',
  'invalid_action',
  'invalid_request',
  'payload_too_large',
  'github_error',
  'bad_response',
  'internal',
])

/**
 * Does this action need a confirmation step?
 *
 * @param {string} action action name.
 * @returns {boolean} true when the panel must ask first.
 */
export function needsConfirmation(action) {
  return DESTRUCTIVE.has(action)
}

/**
 * Build the `POST /action` body, refusing an empty field.
 *
 * @param {string} action action name.
 * @param {{number?: number, body?: string, title?: string}} [fields] form values.
 * @returns {object} request body.
 * @throws {Error} when the action is unknown or a required field is empty.
 */
export function actionPayload(action, fields = {}) {
  if (action === 'comment') {
    const text = String(fields.body ?? '').trim()
    if (text === '') throw new Error('comment.empty')
    return { action, number: fields.number, body: text }
  }
  if (action === 'create-issue') {
    const title = String(fields.title ?? '').trim()
    if (title === '') throw new Error('issue.emptyTitle')
    return { action, title, body: String(fields.body ?? '') }
  }
  if (action === 'close' || action === 'reopen' || action === 'merge') {
    return { action, number: fields.number }
  }
  throw new Error(`action.unknown:${String(action)}`)
}

/**
 * Render one failure in the reader's language.
 *
 * An unknown code is shown as the generic sentence with the Host's own message,
 * never as a raw `error.http_500` key.
 *
 * @param {(key: string, vars?: object) => string} t translator.
 * @param {{code?: string, message?: string, detail?: object}} error failure.
 * @returns {string} human-facing text.
 */
export function errorText(t, error) {
  const code = typeof error?.code === 'string' ? error.code : 'internal'
  if (code === 'rate_limited') {
    const resetAt = error?.detail?.resetAt
    if (typeof resetAt === 'string' && resetAt !== '') {
      const at = new Date(resetAt)
      if (!Number.isNaN(at.getTime())) {
        return t('error.rate_limited', { time: at.toLocaleTimeString() })
      }
    }
    return t('error.rate_limitedSoon')
  }
  if (KNOWN_ERRORS.has(code)) return t(`error.${code}`)
  return t('error.generic', { message: typeof error?.message === 'string' ? error.message : code })
}
