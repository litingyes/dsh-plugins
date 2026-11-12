import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCount, issueKey, labelColor, mergePage, notificationKey, relativeTime } from '../src/client/format.js'

const NOW = Date.parse('2026-11-12T12:00:00Z')

test('relative time covers every unit boundary the panel renders', () => {
  const at = seconds => new Date(NOW + seconds * 1000).toISOString()

  assert.match(relativeTime(at(-5), { now: NOW }), /now|second/iu)
  assert.match(relativeTime(at(-60), { now: NOW }), /minute/iu)
  assert.match(relativeTime(at(-3 * 3600), { now: NOW }), /hour/iu)
  assert.match(relativeTime(at(-2 * 86_400), { now: NOW }), /day/iu)
  assert.match(relativeTime(at(-3 * 7 * 86_400), { now: NOW }), /week/iu)
  assert.match(relativeTime(at(-3 * 30 * 86_400), { now: NOW }), /month/iu)
  assert.match(relativeTime(at(-400 * 86_400), { now: NOW }), /year/iu)
})

test('relative time follows the reader language and tolerates bad input', () => {
  const past = new Date(NOW - 2 * 86_400 * 1000).toISOString()
  assert.match(relativeTime(past, { now: NOW, language: 'zh' }), /天/u)
  assert.match(relativeTime(past, { now: NOW, language: 'en' }), /day/iu)
  assert.equal(relativeTime(''), '')
  assert.equal(relativeTime('not a date'), '')
  assert.equal(relativeTime(undefined), '')
})

test('counts are grouped per language', () => {
  assert.equal(formatCount(1234, 'en'), '1,234')
  assert.equal(formatCount(0, 'zh'), '0')
  assert.equal(formatCount(Number.NaN), '0')
})

test('a second page merges without duplicating what is on screen', () => {
  const first = [{ number: 1 }, { number: 2 }]
  const second = [{ number: 2 }, { number: 3 }]
  assert.deepEqual(mergePage(first, second, issueKey).map(item => item.number), [1, 2, 3])
  assert.deepEqual(mergePage([], second, issueKey).map(item => item.number), [2, 3])
  assert.deepEqual(
    mergePage([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], notificationKey).map(item => item.id),
    ['a', 'b'],
  )
})

test('a label keeps one colour, and GitHub hex wins over the hash', () => {
  assert.equal(labelColor('bug', 'ff0000'), '#ff0000')
  const first = labelColor('needs review')
  assert.match(first, /^hsl\(\d+ 62% 45%\)$/u)
  assert.equal(labelColor('needs review'), first)
  assert.notEqual(labelColor('bug'), labelColor('enhancement'))
  // An empty or malformed colour falls back to the hash.
  assert.match(labelColor('bug', ''), /^hsl\(/u)
  assert.match(labelColor('bug', 'zzz'), /^hsl\(/u)
})
