import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const here = dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: {
    '~': join(here, '../..'),
  },
})

const wr = jiti('./workflowWireRouting.ts')
const {
  pointOnSide,
  outwardNormal,
  oppositeSide,
  rankSides,
  sideAxis,
  polylineLength,
  segmentsIntersect,
  segmentCrossesRect,
  wireWaypoints,
  buildWirePath,
  routedWirePath,
  planOrthogonalRoute,
  aStarOrthogonalRoute,
  ENDPOINT_CIRCLE_R,
  WIRE_END_GAP,
  OBSTACLE_PAD,
  ALL_SIDES,
} = wr

const NODE_W = 240
const NODE_H = 96

test('pointOnSide returns the centre of each side', () => {
  const pos = { x: 100, y: 200 }
  assert.deepEqual(pointOnSide(pos, 'right'), { x: 100 + NODE_W, y: 200 + NODE_H / 2 })
  assert.deepEqual(pointOnSide(pos, 'left'), { x: 100, y: 200 + NODE_H / 2 })
  assert.deepEqual(pointOnSide(pos, 'top'), { x: 100 + NODE_W / 2, y: 200 })
  assert.deepEqual(pointOnSide(pos, 'bottom'), { x: 100 + NODE_W / 2, y: 200 + NODE_H })
})

test('outwardNormal points away from the node per side', () => {
  assert.deepEqual(outwardNormal('right'), { x: 1, y: 0 })
  assert.deepEqual(outwardNormal('left'), { x: -1, y: 0 })
  assert.deepEqual(outwardNormal('top'), { x: 0, y: -1 })
  assert.deepEqual(outwardNormal('bottom'), { x: 0, y: 1 })
})

test('oppositeSide flips each side', () => {
  assert.equal(oppositeSide('right'), 'left')
  assert.equal(oppositeSide('left'), 'right')
  assert.equal(oppositeSide('top'), 'bottom')
  assert.equal(oppositeSide('bottom'), 'top')
})

test('constants + ALL_SIDES are intact', () => {
  assert.equal(ENDPOINT_CIRCLE_R, 4)
  assert.equal(WIRE_END_GAP, 4)
  assert.equal(OBSTACLE_PAD, 8)
  assert.deepEqual([...ALL_SIDES].sort(), ['bottom', 'left', 'right', 'top'])
})

test('sideAxis + rankSides classify direction', () => {
  assert.equal(sideAxis('left'), 'h')
  assert.equal(sideAxis('right'), 'h')
  assert.equal(sideAxis('top'), 'v')
  assert.equal(sideAxis('bottom'), 'v')
  const r = rankSides(10, 5)
  assert.ok(Array.isArray(r) && r.length === 4)
  assert.equal(r[0], 'right') // dx>=0 → primary right
})

test('polylineLength sums segment lengths', () => {
  assert.equal(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]), 7)
  assert.equal(polylineLength([{ x: 0, y: 0 }]), 0)
})

test('segmentsIntersect: detects a crossing X and rejects parallel/disjoint', () => {
  // Crossing diagonals meet at (5,5) → must be detected (regression guard for
  // the prior sign bug that under-reported real crossings).
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), true)
  // Parallel, non-touching → false.
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 5 }, { x: 1, y: 5 }), false)
  // Skew but non-overlapping spans → false.
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 6, y: 1 }), false)
})

test('segmentCrossesRect: edge-crossing, endpoint-inside, and fully-outside', () => {
  // Line passing THROUGH the interior (crosses the left + right edges) → hit.
  // This is the case the sign bug previously missed.
  assert.equal(segmentCrossesRect({ x: -10, y: 5 }, { x: 30, y: 5 }, 0, 0, 20, 20), true)
  // Endpoint inside → hit.
  assert.equal(segmentCrossesRect({ x: 10, y: 10 }, { x: 50, y: 50 }, 0, 0, 20, 20), true)
  // Fully above (quick-reject) → no hit.
  assert.equal(segmentCrossesRect({ x: -10, y: -50 }, { x: 30, y: -50 }, 0, 0, 20, 20), false)
})

test('wireWaypoints + buildWirePath produce a valid SVG path', () => {
  const p1 = { x: 0, y: 0 }
  const p2 = { x: 300, y: 150 }
  const pts = wireWaypoints(p1, p2, 'right', 'left')
  assert.ok(Array.isArray(pts) && pts.length >= 2)
  assert.deepEqual(pts[0], p1)
  const d = buildWirePath(p1, p2, 'right', 'left')
  assert.equal(typeof d, 'string')
  assert.ok(d.startsWith('M'), `path should start with M, got: ${d.slice(0, 12)}`)
})

test('planOrthogonalRoute / aStarOrthogonalRoute / routedWirePath run with obstacles', () => {
  const p1 = { x: 0, y: 0 }
  const p2 = { x: 400, y: 200 }
  const obstacles = [{ x: 150, y: 50, w: 100, h: 60 }]
  const ortho = planOrthogonalRoute(p1, p2, 'right', 'left', obstacles)
  assert.ok(ortho === null || (Array.isArray(ortho) && ortho.length >= 2))
  const a = aStarOrthogonalRoute(p1, p2, 'right', 'left', obstacles)
  assert.ok(a === null || (Array.isArray(a) && a.length >= 2))
  const d = routedWirePath(p1, p2, 'right', 'left', obstacles)
  assert.ok(typeof d === 'string' && d.startsWith('M'))
})
