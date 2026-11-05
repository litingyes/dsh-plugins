import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MAX_LANES, LANE_COLORS, colorForRef, layoutGraph } from '../src/shared/graph.js'

/** Build a commit list from `[sha, ...parents]` tuples. */
function commits(...rows) {
  return rows.map(([sha, ...parents]) => ({ sha, parents }))
}

test('empty input yields no rows and one lane', () => {
  const layout = layoutGraph([])
  assert.deepEqual(layout.rows, [])
  assert.equal(layout.laneCount, 1)
  assert.equal(layout.overflow, false)
})

test('linear history stays in one lane', () => {
  const layout = layoutGraph(commits(['c', 'b'], ['b', 'a'], ['a']))
  assert.equal(layout.laneCount, 1)
  assert.deepEqual(layout.rows.map(row => row.lane), [0, 0, 0])
  assert.deepEqual(layout.rows.map(row => row.color), [0, 0, 0])
  assert.equal(layout.overflow, false)
  // Every row but the last continues downward in the same lane.
  assert.deepEqual(layout.rows[0].outgoing, [{ to: 0, color: 0 }])
  assert.deepEqual(layout.rows[2].outgoing, [])
})

test('a merge commit opens a second lane for its second parent', () => {
  const layout = layoutGraph(commits(['m', 'f1', 'f2'], ['f1'], ['f2']))
  assert.equal(layout.laneCount, 2)
  assert.deepEqual(layout.rows.map(row => row.lane), [0, 0, 1])
  assert.deepEqual(layout.rows[0].outgoing, [{ to: 0, color: 0 }, { to: 1, color: 1 }])
  assert.equal(layout.rows[1].through.length, 1)
  assert.deepEqual(layout.rows[1].through, [{ lane: 1, color: 1 }])
})

test('two lanes converging on one commit report an incoming merge', () => {
  const layout = layoutGraph(commits(['x', 'a', 'b'], ['a', 'p'], ['b', 'p'], ['p']))
  const merge = layout.rows[3]
  assert.equal(merge.lane, 0)
  // Lane 0 is the edge that was already waiting for this commit — the top half of
  // its own lane — and lane 1 is the merge arriving beside it.
  assert.deepEqual(merge.incoming, [{ from: 0, color: 0 }, { from: 1, color: 1 }])
  // Both lanes were consumed, so nothing continues below the merged commit.
  assert.deepEqual(merge.outgoing, [])
})

test('a commit that is already expected in a lane takes that lane', () => {
  // `b` is plain history in lane 0 while an unrelated root `z` sits in lane 1.
  const layout = layoutGraph(commits(['a', 'b', 'z'], ['b'], ['z'], []))
  assert.equal(layout.rows[0].lane, 0)
  assert.equal(layout.rows[1].lane, 0)
  assert.equal(layout.rows[2].lane, 1)
  assert.equal(layout.laneCount, 2)
})

test('lanes are folded past the visible budget', () => {
  const wide = layoutGraph(
    commits(['octopus', 'p1', 'p2', 'p3', 'p4'], []),
    { maxLanes: 2 },
  )
  const first = wide.rows[0]
  assert.equal(wide.overflow, true)
  assert.ok(wide.laneCount <= 2)
  for (const segment of first.outgoing) assert.ok(segment.to < 2)
})

test('default lane budget matches the exported constant', () => {
  assert.equal(DEFAULT_MAX_LANES, 8)
  const many = commits(['root', ...Array.from({ length: 12 }, (_value, index) => `p${index}`)], [])
  const layout = layoutGraph(many)
  assert.equal(layout.overflow, true)
  assert.equal(layout.laneCount, 8)
})

test('colours stay inside the palette', () => {
  const layout = layoutGraph(commits(['m', 'a', 'b'], ['a', 'b'], [], []))
  for (const row of layout.rows) {
    assert.ok(row.color >= 0 && row.color < LANE_COLORS)
    for (const segment of [...row.through, ...row.incoming, ...row.outgoing]) {
      assert.ok(segment.color >= 0 && segment.color < LANE_COLORS)
    }
  }
})

test('root commits release their lane', () => {
  const layout = layoutGraph(commits(['a'], []))
  assert.deepEqual(layout.rows[0].outgoing, [])
  assert.equal(layout.rows[0].lane, 0)
})

test('colorForRef is stable and bounded', () => {
  assert.equal(colorForRef('main'), colorForRef('main'))
  assert.ok(colorForRef('feature/x') < LANE_COLORS)
  assert.equal(colorForRef(''), 0)
  assert.equal(colorForRef(undefined), 0)
})

test('missing parent arrays are tolerated', () => {
  const layout = layoutGraph([{ sha: 'a' }, { sha: 'b', parents: ['a'] }])
  assert.equal(layout.rows.length, 2)
})

test('a commit reports the lane edge arriving from the row above', () => {
  const layout = layoutGraph(commits(['b', 'a'], ['a']))
  // The tip has nothing above it; every commit below it is reached through the
  // lane that was already waiting for it. Without that edge a row draws only the
  // half of its lane below the node, and the graph reads as one dash per commit.
  assert.deepEqual(layout.rows[0].incoming, [])
  assert.deepEqual(layout.rows[1].incoming, [{ from: 0, color: 0 }])
})

test('every lane leaving one row arrives at the next one', () => {
  const shapes = [
    // A merge whose two sides rejoin, then a chain.
    commits(['m', 'a', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'd'], ['d']),
    // A plain chain.
    commits(['h', 'p1'], ['p1', 'p2'], ['p2']),
    // A fork that is never merged back.
    commits(['m', 'a', 'b'], ['a', 'c'], ['b', 'c'], ['c']),
  ]
  for (const history of shapes) {
    const layout = layoutGraph(history)
    for (let index = 0; index + 1 < layout.rows.length; index += 1) {
      const row = layout.rows[index]
      const next = layout.rows[index + 1]
      // Lanes carrying a line at this row's bottom edge...
      const below = new Set([...row.through.map(segment => segment.lane), ...row.outgoing.map(segment => segment.to)])
      // ...must carry one at the next row's top edge, or the seam has a hole.
      const above = new Set([...next.through.map(segment => segment.lane), ...next.incoming.map(segment => segment.from)])
      const seam = `${row.sha}->${next.sha}`
      for (const lane of below) assert.ok(above.has(lane), `seam ${seam} drops lane ${lane}`)
      // And a line never starts at the top of a row that had none below the last.
      for (const lane of above) assert.ok(below.has(lane), `seam ${seam} starts lane ${lane} from nothing`)
    }
  }
})
