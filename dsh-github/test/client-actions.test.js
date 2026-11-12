import assert from 'node:assert/strict'
import test from 'node:test'
import { actionPayload, errorText, needsConfirmation } from '../src/client/actions.js'
import { translate } from '../src/client/i18n.js'

const t = (key, vars) => translate('en', key, vars)

test('only the actions that change state need a confirmation', () => {
  assert.equal(needsConfirmation('merge'), true)
  assert.equal(needsConfirmation('close'), true)
  assert.equal(needsConfirmation('comment'), false)
  assert.equal(needsConfirmation('reopen'), false)
  assert.equal(needsConfirmation('create-issue'), false)
})

test('a comment is trimmed and an empty one never leaves the panel', () => {
  assert.deepEqual(actionPayload('comment', { number: 3, body: '  hi  ' }), { action: 'comment', number: 3, body: 'hi' })
  assert.throws(() => actionPayload('comment', { number: 3, body: '   ' }), /comment\.empty/u)
  assert.throws(() => actionPayload('comment', { number: 3 }), /comment\.empty/u)
})

test('an issue needs a title, and its body is optional', () => {
  assert.deepEqual(actionPayload('create-issue', { title: ' bug ', body: 'details' }), {
    action: 'create-issue',
    title: 'bug',
    body: 'details',
  })
  assert.deepEqual(actionPayload('create-issue', { title: 'bug' }), {
    action: 'create-issue',
    title: 'bug',
    body: '',
  })
  assert.throws(() => actionPayload('create-issue', { title: '  ' }), /issue\.emptyTitle/u)
})

test('state actions carry the number and nothing else', () => {
  for (const action of ['close', 'reopen', 'merge']) {
    assert.deepEqual(actionPayload(action, { number: 9, body: 'ignored' }), { action, number: 9 })
  }
  assert.throws(() => actionPayload('nuke', { number: 1 }), /action\.unknown/u)
})

test('a known failure renders its own sentence', () => {
  assert.equal(errorText(t, { code: 'no_token' }), t('error.no_token'))
  assert.equal(errorText(t, { code: 'not_found' }), t('error.not_found'))
  assert.equal(errorText(t, { code: 'gh_missing' }), t('error.gh_missing'))
})

test('a rate limit names the reset time, and degrades without one', () => {
  const resetAt = new Date('2026-11-12T12:30:00Z').toISOString()
  const text = errorText(t, { code: 'rate_limited', detail: { resetAt } })
  assert.match(text, /retry after/iu)

  const noDetail = errorText(t, { code: 'rate_limited' })
  assert.equal(noDetail, t('error.rate_limitedSoon'))

  const bad = errorText(t, { code: 'rate_limited', detail: { resetAt: 'nonsense' } })
  assert.equal(bad, t('error.rate_limitedSoon'))
})

test('an unknown code shows the Host message instead of a raw key', () => {
  const text = errorText(t, { code: 'http_500', message: 'boom' })
  assert.equal(text, t('error.generic', { message: 'boom' }))
  assert.ok(!text.includes('error.http_500'))
})
