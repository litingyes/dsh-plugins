/**
 * Commit-graph lane layout.
 *
 * Pure and dependency-free, so the same function runs in the browser bundle and
 * under `node --test`. It turns a date-ordered commit list into one row per
 * commit describing exactly the line work a renderer must draw, which keeps the
 * React view free of graph arithmetic.
 *
 * The model is a set of lanes, each expecting one specific commit next. Walking
 * the log in the order git emitted:
 *   1. the commit takes the lane that already expects it, else a free lane, else
 *      a new lane;
 *   2. that lane is re-pointed at the commit's first parent — a branch chain
 *      keeps its lane and its colour;
 *   3. every remaining parent takes a lane of its own, which is what makes
 *      several branches visible side by side;
 *   4. a lane that expected this commit but is not the commit's own lane is a
 *      merge, drawn as a curve into the node.
 *
 * @module @litingyes/dsh-git/graph
 */

/** Lanes beyond this are folded into the last column instead of widening the graph. */
export const DEFAULT_MAX_LANES = 8

/** How many distinct lane colours the renderer must provide. */
export const LANE_COLORS = 8

/**
 * Lay out one commit graph.
 *
 * @param {{sha: string, parents?: string[]}[]} commits commits in graph order.
 * @param {{maxLanes?: number}} [options] layout options.
 * @returns {{
 *   rows: {
 *     sha: string,
 *     lane: number,
 *     color: number,
 *     through: {lane: number, color: number}[],
 *     incoming: {from: number, color: number}[],
 *     outgoing: {to: number, color: number}[],
 *   }[],
 *   laneCount: number,
 *   overflow: boolean,
 * }}
 */
export function layoutGraph(commits, options = {}) {
  const maxLanes = Math.max(1, options.maxLanes ?? DEFAULT_MAX_LANES)
  /** @type {(string|null)[]} */
  const lanes = []
  /** @type {(number|null)[]} */
  const colors = []
  let nextColor = 0
  let overflow = false

  const allocateColor = () => {
    const color = nextColor % LANE_COLORS
    nextColor += 1
    return color
  }

  const rows = []
  let widest = { raw: 0, shown: 1 }

  /** Fold any lane index past the visible budget into the last column. */
  const fold = (lane) => {
    if (lane < maxLanes) return lane
    overflow = true
    return maxLanes - 1
  }

  for (const commit of Array.isArray(commits) ? commits : []) {
    const parents = Array.isArray(commit.parents) ? commit.parents : []
    const before = lanes.slice()
    const beforeColors = colors.slice()

    // 1. Pick the lane that already expects this commit.
    let lane = lanes.indexOf(commit.sha)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) {
        lanes.push(null)
        colors.push(null)
        lane = lanes.length - 1
      }
    }
    if (colors[lane] === null || colors[lane] === undefined) colors[lane] = allocateColor()
    const color = colors[lane]

    // 4. Any other lane that expected this commit is a merge into it.
    const incoming = []
    for (let index = 0; index < lanes.length; index += 1) {
      if (index !== lane && lanes[index] === commit.sha) {
        incoming.push({ from: fold(index), color: colors[index] ?? color })
        lanes[index] = null
        colors[index] = null
      }
    }

    // 2. Continue this lane into the first parent.
    lanes[lane] = parents[0] ?? null

    // 3. Give every further parent a lane of its own.
    for (const parent of parents.slice(1)) {
      if (lanes.includes(parent)) continue
      let slot = lanes.indexOf(null)
      if (slot === -1) {
        lanes.push(null)
        colors.push(null)
        slot = lanes.length - 1
      }
      lanes[slot] = parent
      colors[slot] = allocateColor()
    }

    const after = lanes.slice()
    const afterColors = colors.slice()
    widest = {
      raw: Math.max(widest.raw, before.length, after.length),
      shown: Math.max(widest.shown, fold(Math.max(before.length, after.length) - 1) + 1),
    }

    // Classify every column so the renderer never has to guess.
    const through = []
    const outgoing = []
    const columns = Math.max(before.length, after.length)
    for (let index = 0; index < columns; index += 1) {
      const was = before[index] ?? null
      const now = after[index] ?? null
      if (was !== null && was !== commit.sha && now === was) {
        through.push({ lane: fold(index), color: beforeColors[index] ?? color })
        continue
      }
      if (now !== null) {
        outgoing.push({ to: fold(index), color: afterColors[index] ?? color })
      }
    }

    rows.push({ sha: commit.sha, lane: fold(lane), color, through, incoming, outgoing })

    // Keep the array dense from the left so folded lanes stay meaningful.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
      colors.pop()
    }
  }

  return {
    rows,
    laneCount: Math.max(1, Math.min(maxLanes, widest.shown)),
    overflow,
  }
}

/**
 * Pick a stable lane colour for a ref name.
 *
 * Branch badges and lane colours reuse the same palette so a reader can follow
 * one branch across the graph.
 *
 * @param {string | null | undefined} name ref name.
 * @returns {number} palette index in `[0, LANE_COLORS)`.
 */
export function colorForRef(name) {
  if (typeof name !== 'string' || name === '') return 0
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100003
  }
  return hash % LANE_COLORS
}
