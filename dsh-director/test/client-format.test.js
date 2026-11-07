import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clip,
  formatClock,
  formatSeconds,
  productionPath,
  purposeKey,
  reviewCodeKey,
  sceneTotals,
  selectedTake,
  statusKey,
} from '../src/client/format.js'

test('formatSeconds keeps one decimal and never prints a negative duration', () => {
  assert.equal(formatSeconds(4), '4s')
  assert.equal(formatSeconds(3.5), '3.5s')
  assert.equal(formatSeconds(3.49), '3.5s')
  assert.equal(formatSeconds(0), '0s')
  assert.equal(formatSeconds(Number.NaN), '0s')
})

test('formatClock renders mm:ss', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(4), '0:04')
  assert.equal(formatClock(65), '1:05')
  assert.equal(formatClock(-3), '0:00')
})

test('clip collapses whitespace and ellipsizes', () => {
  assert.equal(clip('a\n b', 10), 'a b')
  assert.equal(clip('abcdef', 4), 'abc…')
  assert.equal(clip(undefined, 4), '')
})

test('statusKey and purposeKey fall back for unknown values', () => {
  assert.equal(statusKey('selected'), 'status.selected')
  assert.equal(statusKey('weird'), 'status.other')
  assert.equal(purposeKey('hook'), 'purpose.hook')
  assert.equal(purposeKey(''), null)
  assert.equal(reviewCodeKey('NO_MUSIC'), 'review.code.NO_MUSIC')
  assert.equal(reviewCodeKey(undefined), 'review.code.OTHER')
})

test('productionPath shortens long paths from the middle', () => {
  assert.equal(productionPath('/workspace', 'video'), '/workspace/video')
  const long = productionPath(`/${'a'.repeat(80)}`, 'video', 24)
  assert.ok(long.length <= 25)
  assert.match(long, /…/)
  assert.equal(productionPath('/workspace/', 'video'), '/workspace/video')
})

test('sceneTotals sums shot durations and counts shots', () => {
  const totals = sceneTotals({
    shots: [{ durationSec: 4 }, { durationSec: 2.5 }, {}],
  })
  assert.equal(totals.shots, 3)
  assert.equal(totals.seconds, 6.5)
  assert.deepEqual(sceneTotals(null), { shots: 0, seconds: 0 })
})

test('selectedTake finds the selected take or null', () => {
  assert.equal(selectedTake({ takes: [{ id: 't1' }, { id: 't2', selected: true }] }).id, 't2')
  assert.equal(selectedTake({ takes: [] }), null)
  assert.equal(selectedTake({}), null)
})
