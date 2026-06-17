// Pure wire-routing engine for the workflow canvas — orthogonal/A* path
// planning + geometry. Extracted verbatim from WorkflowNodeCanvas.vue so it can
// be unit-tested in isolation (see workflowWireRouting.test.mjs). Everything
// here is framework-free and reactive-state-free: callers pass plain Pt/Size/
// Obstacle values in. The SFC keeps its own structurally-identical Pt/Size/
// Side/Obstacle types and passes them straight through.
import type { WireSide } from '~/composables/workflows/useWorkflows'
import { NODE_W, NODE_H } from '~/composables/workflows/workflowLayoutMetrics'

export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }
export type Side = WireSide
export interface Obstacle { x: number; y: number; w: number; h: number }

export function pointOnSide(pos: Pt, side: Side, size: Size = { w: NODE_W, h: NODE_H }): Pt {
  switch (side) {
    case 'right': return { x: pos.x + size.w, y: pos.y + size.h / 2 }
    case 'left': return { x: pos.x, y: pos.y + size.h / 2 }
    case 'top': return { x: pos.x + size.w / 2, y: pos.y }
    case 'bottom': return { x: pos.x + size.w / 2, y: pos.y + size.h }
  }
}

export function outwardNormal(side: Side): Pt {
  switch (side) {
    case 'right': return { x: 1, y: 0 }
    case 'left': return { x: -1, y: 0 }
    case 'top': return { x: 0, y: -1 }
    case 'bottom': return { x: 0, y: 1 }
  }
}

// (mid - port) · outwardNormal(side). Positive when the port faces TOWARD
// the chord midpoint (normal inward-flow, like A.right → B.left for nodes
// side-by-side); negative when the port faces AWAY (A.left → B.right). The
// outward case is what triggers wraparound routing in wireGeoms.
export function outwardNormalDotMid(side: Side, port: Pt, mid: Pt): number {
  const n = outwardNormal(side)
  return (mid.x - port.x) * n.x + (mid.y - port.y) * n.y
}


export function oppositeSide(s: Side): Side {
  switch (s) {
    case 'top': return 'bottom'
    case 'bottom': return 'top'
    case 'left': return 'right'
    case 'right': return 'left'
  }
}

// `outwardNormal` is defined further below near the wire-routing helpers and
// re-used here for nudging the arrow-head endpoint grip circle outboard so it
// sits just past the arrowhead marker instead of on top of it.

export const ENDPOINT_CIRCLE_R = 4

// Pointer-event hit radius for the grip dots. The visible circle stays
// at `ENDPOINT_CIRCLE_R`; an invisible disc of this radius sits on top
// so the user doesn't need pixel-perfect aim to grab the endpoint.

export const WIRE_END_GAP = ENDPOINT_CIRCLE_R

// Position of the grip circle (and matching snap-target circle) for a
// node side. `pointOnSide` returns the OUTER edge of the card's box, but
// the card draws a `border-2` line INSIDE that box (Tailwind defaults to
// `box-sizing: border-box`), so the visible border's centre sits half a
// border width inboard of the outer edge. Nudging the grip the same
// distance inward puts the visible border line through the middle of
// the circle instead of along its outboard edge.

export function rankSides(dx: number, dy: number): Side[] {
  const xSide: Side = dx >= 0 ? 'right' : 'left'
  const ySide: Side = dy >= 0 ? 'bottom' : 'top'
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [xSide, ySide, oppositeSide(ySide), oppositeSide(xSide)]
  }
  return [ySide, xSide, oppositeSide(xSide), oppositeSide(ySide)]
}

export function sideAxis(s: Side): 'h' | 'v' {
  return (s === 'left' || s === 'right') ? 'h' : 'v'
}

// Bend count and directional feasibility for the orthogonal step route
// between two ports. `feasible` is true when every leg of the path leaves
// the source outward and enters the target inward — i.e. the wire does
// not have to fold back across its own port to reach the corner.
export function pathInfo(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side,
): { bends: number; feasible: boolean } {
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const sx = dx === 0 ? 0 : Math.sign(dx)
  const sy = dy === 0 ? 0 : Math.sign(dy)
  if (sideAxis(fromSide) === sideAxis(toSide)) {
    // Same axis: 0-bend straight if collinear, else 2-bend midpoint S.
    if (sideAxis(fromSide) === 'h') {
      const facing = n1.x === -n2.x
      const departOk = sx === n1.x || sx === 0
      return { bends: p1.y === p2.y ? 0 : 2, feasible: facing && departOk }
    }
    const facing = n1.y === -n2.y
    const departOk = sy === n1.y || sy === 0
    return { bends: p1.x === p2.x ? 0 : 2, feasible: facing && departOk }
  }
  // Mixed axes: 1-bend L. Leg 1 lies along fromAxis, leg 2 along toAxis.
  // Strict here — a zero-length leg means the side isn't really emitting
  // in its outward direction (e.g. A's right port firing straight down
  // because the target sits exactly below), which reads as the wrong side.
  let leg1: boolean, leg2: boolean
  if (sideAxis(fromSide) === 'h') {
    leg1 = sx === n1.x
    leg2 = sy === -n2.y
  } else {
    leg1 = sy === n1.y
    leg2 = sx === -n2.x
  }
  return { bends: 1, feasible: leg1 && leg2 }
}

export const ALL_SIDES: Side[] = ['right', 'bottom', 'left', 'top']

// True when the segment from `a` to `b` enters the rectangle.
// Used by the obstacle-aware wire side picker so wires bend around
// unrelated nodes rather than slicing through them.
export function segmentCrossesRect(
  a: Pt, b: Pt, rx: number, ry: number, rw: number, rh: number,
): boolean {
  const rRight = rx + rw
  const rBottom = ry + rh
  // Quick reject if both endpoints lie strictly outside one side.
  if ((a.x < rx && b.x < rx) || (a.x > rRight && b.x > rRight)) return false
  if ((a.y < ry && b.y < ry) || (a.y > rBottom && b.y > rBottom)) return false
  // Either endpoint inside → counts as a crossing.
  if (a.x >= rx && a.x <= rRight && a.y >= ry && a.y <= rBottom) return true
  if (b.x >= rx && b.x <= rRight && b.y >= ry && b.y <= rBottom) return true
  // Otherwise check intersection against each rectangle edge.
  return (
    segmentsIntersect(a, b, { x: rx, y: ry }, { x: rRight, y: ry })
    || segmentsIntersect(a, b, { x: rRight, y: ry }, { x: rRight, y: rBottom })
    || segmentsIntersect(a, b, { x: rRight, y: rBottom }, { x: rx, y: rBottom })
    || segmentsIntersect(a, b, { x: rx, y: rBottom }, { x: rx, y: ry })
  )
}

export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const dx1 = p2.x - p1.x
  const dy1 = p2.y - p1.y
  const dx2 = p4.x - p3.x
  const dy2 = p4.y - p3.y
  const denom = dx2 * dy1 - dy2 * dx1
  if (Math.abs(denom) < 1e-9) return false
  // Numerators use (p3 - p1) to match the sign of `denom` above. (A prior
  // version used (p1 - p3), which negated ua/ub and made every real crossing
  // fall outside [0,1] — i.e. crossings were silently under-reported.)
  const ua = (dx2 * (p3.y - p1.y) - dy2 * (p3.x - p1.x)) / denom
  const ub = (dx1 * (p3.y - p1.y) - dy1 * (p3.x - p1.x)) / denom
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

// Polyline approximation of a wire used for obstacle-overlap detection.
// Step wires resolve to their corner sequence via `wireWaypoints`.
export const OBSTACLE_PAD = 8
export function wireSamplePoints(p1: Pt, p2: Pt, fromSide: Side, toSide: Side): Pt[] {
  return wireWaypoints(p1, p2, fromSide, toSide)
}

// Per-wire side assignment. Picks the (fromSide, toSide) pair lexicographically:
//   1. Prefer non-backtracking routes (legs leave the source outward and
//      enter the target inward).
//   2. Then minimise the number of 90° bends — 0 if the ports are collinear
//      on a shared axis, 1 for an L-shape, 2 for a same-axis midpoint route.
//   3. Then minimise the straight-line distance between the two ports, so
//      the wire always lands on the side closest to the other node.
//   4. Final tiebreaker uses rankSides so a perfectly symmetric layout
//      prefers the side that faces the dominant axis.
// Structural constraint: on a single node, no incoming wire shares a side
// with any outgoing wire.
//
// Recomputes live as nodes move — including during an active drag — so
// the wires re-route in real time to follow the dragged node's new
// position.

export function wireWaypoints(p1: Pt, p2: Pt, fromSide: Side, toSide: Side): Pt[] {
  const isFromHorizontal = fromSide === 'left' || fromSide === 'right'
  const isToHorizontal = toSide === 'left' || toSide === 'right'
  const pts: Pt[] = [{ ...p1 }]
  if (isFromHorizontal && isToHorizontal) {
    const mx = (p1.x + p2.x) / 2
    pts.push({ x: mx, y: p1.y })
    pts.push({ x: mx, y: p2.y })
  } else if (!isFromHorizontal && !isToHorizontal) {
    const my = (p1.y + p2.y) / 2
    pts.push({ x: p1.x, y: my })
    pts.push({ x: p2.x, y: my })
  } else if (isFromHorizontal) {
    pts.push({ x: p2.x, y: p1.y })
  } else {
    pts.push({ x: p1.x, y: p2.y })
  }
  pts.push({ ...p2 })
  return pts
}

// Does an axis-aligned segment cross a rect's interior? Endpoints sitting
// exactly on the rect boundary don't count as crossings — important
// because every stub starts at p1 / p2, which are on the wire's endpoint
// node's edge. Different from the generic `segmentCrossesRect` defined
// for the side-picker above: that one treats boundary contact as a hit;
// here we need the opposite so stub endpoints don't false-trigger.
export function orthoSegmentCrossesRect(a: Pt, b: Pt, r: Obstacle): boolean {
  const rx2 = r.x + r.w
  const ry2 = r.y + r.h
  if (Math.abs(a.y - b.y) < 0.5) {
    // Horizontal segment at y = a.y.
    if (a.y <= r.y || a.y >= ry2) return false
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    return maxX > r.x && minX < rx2
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    // Vertical segment at x = a.x.
    if (a.x <= r.x || a.x >= rx2) return false
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return maxY > r.y && minY < ry2
  }
  // Diagonal segments don't appear in our orthogonal routes — never
  // called in practice, return false to make the helper total.
  return false
}

export function polylineCrossesAnyObstacle(pts: Pt[], obstacles: Obstacle[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    for (const o of obstacles) {
      if (orthoSegmentCrossesRect(a, b, o)) return true
    }
  }
  return false
}

export function polylineLength(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
  }
  return len
}

// Plan an orthogonal route from p1 (leaving fromSide) to p2 (arriving
// from toSide) that doesn't cross any obstacle interior. The route
// always starts with a STUB-px perpendicular stub out of p1 and ends
// with a STUB-px perpendicular stub into p2, so the arrow lands square
// on the edge. Between the stubs, we try a handful of orthogonal
// candidates (direct, around-top, around-bottom, around-left,
// around-right) and pick the shortest one that clears every obstacle.
// Returns null if no candidate clears — caller falls back to A*.
export function planOrthogonalRoute(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): Pt[] | null {
  const STUB = 40
  const CLEAR = 44
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const stubFrom: Pt = { x: p1.x + n1.x * STUB, y: p1.y + n1.y * STUB }
  const stubTo: Pt = { x: p2.x + n2.x * STUB, y: p2.y + n2.y * STUB }
  const isFromHorizontal = fromSide === 'left' || fromSide === 'right'
  const isToHorizontal = toSide === 'left' || toSide === 'right'

  // Bounding rectangle of all obstacles + the stubs / endpoints — used
  // to size the around-* detour lanes so they always clear.
  let minX = Math.min(stubFrom.x, stubTo.x, p1.x, p2.x)
  let maxX = Math.max(stubFrom.x, stubTo.x, p1.x, p2.x)
  let minY = Math.min(stubFrom.y, stubTo.y, p1.y, p2.y)
  let maxY = Math.max(stubFrom.y, stubTo.y, p1.y, p2.y)
  for (const o of obstacles) {
    if (o.x < minX) minX = o.x
    if (o.x + o.w > maxX) maxX = o.x + o.w
    if (o.y < minY) minY = o.y
    if (o.y + o.h > maxY) maxY = o.y + o.h
  }
  const topLane = minY - CLEAR
  const bottomLane = maxY + CLEAR
  const leftLane = minX - CLEAR
  const rightLane = maxX + CLEAR

  const candidates: Pt[][] = []

  // Direct: stub out, connect to other stub, stub in. Branches on the
  // port orientations so the connection between stubs is always
  // orthogonal — same-axis ports collapse to a Z, mixed axes get an L.
  if (isFromHorizontal && isToHorizontal) {
    if (Math.abs(stubFrom.y - stubTo.y) < 0.5) {
      candidates.push([p1, stubFrom, stubTo, p2])
    }
    else {
      const mx = (stubFrom.x + stubTo.x) / 2
      candidates.push([
        p1, stubFrom,
        { x: mx, y: stubFrom.y },
        { x: mx, y: stubTo.y },
        stubTo, p2,
      ])
    }
  }
  else if (!isFromHorizontal && !isToHorizontal) {
    if (Math.abs(stubFrom.x - stubTo.x) < 0.5) {
      candidates.push([p1, stubFrom, stubTo, p2])
    }
    else {
      const my = (stubFrom.y + stubTo.y) / 2
      candidates.push([
        p1, stubFrom,
        { x: stubFrom.x, y: my },
        { x: stubTo.x, y: my },
        stubTo, p2,
      ])
    }
  }
  else if (isFromHorizontal) {
    // Two L variants. Variant A turns at stubFrom's y (extend along the
    // source's outward direction, then bend perpendicular into the
    // target). Variant B turns perpendicular at stubFrom.x first, then
    // crosses to stubTo. Variant A collapses to a clean 1-bend L when
    // stubTo sits forward of stubFrom along the source's outward axis,
    // but folds back through stubFrom into a 180° spike when stubTo
    // sits behind — Variant B has 90° corners in every layout, so the
    // spike-filter below can drop Variant A without leaving us empty.
    candidates.push([
      p1, stubFrom,
      { x: stubTo.x, y: stubFrom.y },
      stubTo, p2,
    ])
    candidates.push([
      p1, stubFrom,
      { x: stubFrom.x, y: stubTo.y },
      stubTo, p2,
    ])
  }
  else {
    candidates.push([
      p1, stubFrom,
      { x: stubFrom.x, y: stubTo.y },
      stubTo, p2,
    ])
    candidates.push([
      p1, stubFrom,
      { x: stubTo.x, y: stubFrom.y },
      stubTo, p2,
    ])
  }

  // Around-top / around-bottom: route along the perpendicular lane
  // above / below the obstacle bbox, with stubs into both endpoints.
  // The horizontal-aligned candidates work for both horizontal-horizontal
  // and mixed configs (the lane is set on the cross axis of each stub).
  candidates.push([
    p1, stubFrom,
    { x: stubFrom.x, y: topLane },
    { x: stubTo.x, y: topLane },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: stubFrom.x, y: bottomLane },
    { x: stubTo.x, y: bottomLane },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: leftLane, y: stubFrom.y },
    { x: leftLane, y: stubTo.y },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: rightLane, y: stubFrom.y },
    { x: rightLane, y: stubTo.y },
    stubTo, p2,
  ])

  // No-stub direct candidates — route p1 → midpoint → p2 without the
  // fixed STUB-px stub. These exist for close-node layouts where the
  // stub-based Z / L candidates above all collapse into 180° spikes
  // because stubFrom and stubTo overlap each other. Without the stub
  // there's no overlap to backtrack across, so the candidate is clean
  // even when the endpoints are 1–2px apart in one axis. For wide-node
  // layouts these have the same total length as the stub-based Z (both
  // run along the same midpoint axis), and the stub-based candidate is
  // listed first so it wins the tiebreak — preserving the schematic
  // look with a clean STUB-length straight before/after each corner.
  if (isFromHorizontal && isToHorizontal) {
    if (Math.abs(p1.y - p2.y) < 0.5) {
      candidates.push([p1, p2])
    }
    else {
      const dmx = (p1.x + p2.x) / 2
      candidates.push([p1, { x: dmx, y: p1.y }, { x: dmx, y: p2.y }, p2])
    }
  }
  else if (!isFromHorizontal && !isToHorizontal) {
    if (Math.abs(p1.x - p2.x) < 0.5) {
      candidates.push([p1, p2])
    }
    else {
      const dmy = (p1.y + p2.y) / 2
      candidates.push([p1, { x: p1.x, y: dmy }, { x: p2.x, y: dmy }, p2])
    }
  }
  else if (isFromHorizontal) {
    candidates.push([p1, { x: p2.x, y: p1.y }, p2])
    candidates.push([p1, { x: p1.x, y: p2.y }, p2])
  }
  else {
    candidates.push([p1, { x: p1.x, y: p2.y }, p2])
    candidates.push([p1, { x: p2.x, y: p1.y }, p2])
  }

  // Pick the shortest candidate that doesn't cross any obstacle AND
  // doesn't fold back through itself at a corner. The stubs are first /
  // last segments and always sit on the boundary of the wire's endpoint
  // nodes (which are obstacles when their ports are outward) —
  // `segmentCrossesRect` treats boundary contact as "outside" so the
  // stubs themselves never false-positive. The spike check rejects
  // candidates where any interior corner is a 180° backtrack, which
  // would render as a pointy degenerate arc instead of a smooth bend.
  let best: Pt[] | null = null
  let bestLen = Infinity
  for (const pts of candidates) {
    if (hasOrthogonalSpike(pts)) continue
    if (!leavesAndArrivesPerpendicular(pts, fromSide, toSide)) continue
    if (polylineCrossesAnyObstacle(pts, obstacles)) continue
    const len = polylineLength(pts)
    if (len < bestLen) {
      bestLen = len
      best = pts
    }
  }
  return best
}

// True when the polyline leaves p1 along outwardNormal(fromSide) and
// arrives at p2 from outwardNormal(toSide). Zero-length leading /
// trailing segments are skipped so the FIRST real displacement out of
// p1 (and last real displacement into p2) is the one that votes —
// otherwise a degenerate `[p1, p1, p2, p2]` shape would pass on its
// nonexistent first segment. Used to drop no-stub direct candidates
// that would render as a sideways chord out of a perpendicular port:
// e.g. top→top connecting two horizontally-aligned nodes must exit each
// top port upward first, not slide straight across as a flat horizontal
// chord (which is shorter and would otherwise win the length tiebreak).
export function leavesAndArrivesPerpendicular(
  pts: Pt[], fromSide: Side, toSide: Side,
): boolean {
  if (pts.length < 2) return false
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const start = pts[0]!
  let fwdIdx = 1
  while (
    fwdIdx < pts.length
    && Math.abs(pts[fwdIdx]!.x - start.x) < 0.5
    && Math.abs(pts[fwdIdx]!.y - start.y) < 0.5
  ) fwdIdx++
  if (fwdIdx >= pts.length) return false
  const fdx = pts[fwdIdx]!.x - start.x
  const fdy = pts[fwdIdx]!.y - start.y
  if (fdx * n1.x + fdy * n1.y <= 0) return false
  const end = pts[pts.length - 1]!
  let backIdx = pts.length - 2
  while (
    backIdx >= 0
    && Math.abs(end.x - pts[backIdx]!.x) < 0.5
    && Math.abs(end.y - pts[backIdx]!.y) < 0.5
  ) backIdx--
  if (backIdx < 0) return false
  // Wire arrives at p2 traveling along (-n2); equivalently, going BACK
  // from p2 to the previous real vertex should align with n2.
  const bdx = pts[backIdx]!.x - end.x
  const bdy = pts[backIdx]!.y - end.y
  if (bdx * n2.x + bdy * n2.y <= 0) return false
  return true
}

// True when any interior vertex in the polyline is a 180° backtrack —
// the previous and next vertices both lie on the same side of the
// corner along the same axis. The rounded-corner renderer collapses
// these into a degenerate spike instead of a smooth arc, so route
// planners use this to drop candidates that would render as a pointy
// outcropping near the stub.
export function hasOrthogonalSpike(pts: Pt[]): boolean {
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = prev.x - curr.x
    const v1y = prev.y - curr.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    // Zero-length segments fold into their neighbour at render time;
    // they can't produce a spike on their own.
    if (len1 < 0.5 || len2 < 0.5) continue
    // Both vectors point into the same half-plane → corner folds back
    // on itself. Dot product is positive only when the angle between
    // them is < 90°, which for axis-aligned vectors means parallel
    // same-direction (180° backtrack).
    if (v1x * v2x + v1y * v2y > 0) return true
  }
  return false
}

// Grid A* orthogonal router used when `planOrthogonalRoute`'s 5 fixed
// candidates all crash through obstacles — typically when a third node
// sits between the wire's endpoints on the natural lane, or when
// neighbouring nodes block the wraparound lanes the simple planner would
// have used. Returns a polyline (p1 → stubFrom → grid-aligned interior →
// stubTo → p2) that weaves around every obstacle interior, or null if
// even the stub cell itself is blocked (source / target overlap with an
// obstacle), in which case the caller falls through to `buildWirePath`.
export function aStarOrthogonalRoute(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): Pt[] | null {
  const STEP = 24
  const STUB = 40
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const stubFrom: Pt = { x: p1.x + n1.x * STUB, y: p1.y + n1.y * STUB }
  const stubTo: Pt = { x: p2.x + n2.x * STUB, y: p2.y + n2.y * STUB }

  let minX = Math.min(stubFrom.x, stubTo.x, p1.x, p2.x)
  let maxX = Math.max(stubFrom.x, stubTo.x, p1.x, p2.x)
  let minY = Math.min(stubFrom.y, stubTo.y, p1.y, p2.y)
  let maxY = Math.max(stubFrom.y, stubTo.y, p1.y, p2.y)
  for (const o of obstacles) {
    if (o.x < minX) minX = o.x
    if (o.x + o.w > maxX) maxX = o.x + o.w
    if (o.y < minY) minY = o.y
    if (o.y + o.h > maxY) maxY = o.y + o.h
  }
  // Breathing room so the around-* wraparound lanes have somewhere to live.
  const PAD = STEP * 4
  minX -= PAD; maxX += PAD; minY -= PAD; maxY += PAD

  // Align the grid so stubFrom lands on cell (0, *) exactly — keeps the
  // emerging stub geometrically aligned with the rendered wire.
  const originX = stubFrom.x - Math.ceil((stubFrom.x - minX) / STEP) * STEP
  const originY = stubFrom.y - Math.ceil((stubFrom.y - minY) / STEP) * STEP
  const cols = Math.ceil((maxX - originX) / STEP) + 1
  const rows = Math.ceil((maxY - originY) / STEP) + 1
  // Cap grid size so an out-of-bounds drag can't lock up the render thread.
  if (cols * rows > 50000) return null

  // Block any cell whose centre falls strictly inside an obstacle — cells
  // sitting exactly on the boundary stay open so a stub landing on a
  // node's outer edge isn't trapped before it can leave.
  const blocked = new Uint8Array(cols * rows)
  for (const o of obstacles) {
    const cxLo = Math.max(0, Math.ceil((o.x - originX) / STEP))
    const cxHi = Math.min(cols - 1, Math.floor((o.x + o.w - originX) / STEP))
    const cyLo = Math.max(0, Math.ceil((o.y - originY) / STEP))
    const cyHi = Math.min(rows - 1, Math.floor((o.y + o.h - originY) / STEP))
    for (let cy = cyLo; cy <= cyHi; cy++) {
      const row = cy * cols
      for (let cx = cxLo; cx <= cxHi; cx++) {
        const px = originX + cx * STEP
        const py = originY + cy * STEP
        if (px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h) {
          blocked[row + cx] = 1
        }
      }
    }
  }

  const startCx = Math.round((stubFrom.x - originX) / STEP)
  const startCy = Math.round((stubFrom.y - originY) / STEP)
  const goalCx = Math.round((stubTo.x - originX) / STEP)
  const goalCy = Math.round((stubTo.y - originY) / STEP)
  if (startCx < 0 || startCx >= cols || startCy < 0 || startCy >= rows) return null
  if (goalCx < 0 || goalCx >= cols || goalCy < 0 || goalCy >= rows) return null
  if (blocked[startCy * cols + startCx]) return null
  if (blocked[goalCy * cols + goalCx]) return null

  // 4-direction movement: 0=+x, 1=-x, 2=+y, 3=-y. A turn-cost surcharge
  // (`TURN`) pushes A* toward visually tidy paths with few bends, even
  // when several equal-length routes exist. TURN is in units of cells —
  // each extra bend must save at least TURN cells of length before A*
  // will accept it, so a higher value trades small detours for fewer
  // (longer) legs. Set high enough that A* will route ~4 cells out of
  // the way to avoid a zigzag between close-together nodes.
  type Cell = { cx: number; cy: number; g: number; f: number; dir: number; parent: Cell | null }
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const initDir = dirs.findIndex(([dx, dy]) => dx === Math.sign(n1.x) && dy === Math.sign(n1.y))
  const heur = (cx: number, cy: number): number =>
    Math.abs(cx - goalCx) + Math.abs(cy - goalCy)
  const TURN = 4

  const open: Cell[] = [{
    cx: startCx, cy: startCy, g: 0,
    f: heur(startCx, startCy), dir: initDir, parent: null,
  }]
  const closed = new Uint8Array(cols * rows)
  // Hard cap on expansions for the same reason as the grid-size cap.
  let expansions = 0
  const MAX_EXPANSIONS = cols * rows * 2

  while (open.length > 0) {
    if (++expansions > MAX_EXPANSIONS) return null
    // Linear scan over the open list. A binary heap would be asymptotically
    // faster, but the open list typically stays under a few hundred entries
    // before A* hits the goal for grids of this size.
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i
    }
    const curr = open.splice(bestIdx, 1)[0]!
    const key = curr.cy * cols + curr.cx
    if (closed[key]) continue
    closed[key] = 1

    if (curr.cx === goalCx && curr.cy === goalCy) {
      const cellPath: Pt[] = []
      let n: Cell | null = curr
      while (n) {
        cellPath.push({ x: originX + n.cx * STEP, y: originY + n.cy * STEP })
        n = n.parent
      }
      cellPath.reverse()
      // Collapse co-linear interior cells so the rounded-corner renderer
      // only sees the actual bends.
      const out: Pt[] = [p1, stubFrom]
      for (let i = 1; i < cellPath.length - 1; i++) {
        const prev = cellPath[i - 1]!
        const here = cellPath[i]!
        const next = cellPath[i + 1]!
        const sameX = here.x === prev.x && here.x === next.x
        const sameY = here.y === prev.y && here.y === next.y
        if (!sameX && !sameY) out.push(here)
      }
      // Bridge: the grid is aligned to stubFrom, so stubTo may sit a
      // fraction of a cell off its column / row when the wire endpoints
      // don't share a grid offset (e.g. mixed horizontal / vertical
      // ports). A direct connection from the last interior cell to
      // stubTo would then render as a tiny diagonal — insert an
      // axis-aligned intermediate so the final approach matches
      // toSide's inward normal.
      const lastPt = out[out.length - 1]!
      const toHorizontal = toSide === 'left' || toSide === 'right'
      if (toHorizontal && lastPt.y !== stubTo.y) {
        out.push({ x: lastPt.x, y: stubTo.y })
      }
      else if (!toHorizontal && lastPt.x !== stubTo.x) {
        out.push({ x: stubTo.x, y: lastPt.y })
      }
      out.push(stubTo, p2)
      return out
    }

    for (let d = 0; d < 4; d++) {
      const [dx, dy] = dirs[d]!
      const nx = curr.cx + dx
      const ny = curr.cy + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const nkey = ny * cols + nx
      if (closed[nkey] || blocked[nkey]) continue
      // The first step out of the start cell is charged against the
      // outward-normal heading; later steps against the cell's own incoming
      // direction. Keeps the stub straight unless turning saves real
      // distance.
      const refDir = curr.parent === null ? initDir : curr.dir
      const turnCost = d !== refDir ? TURN : 0
      const ng = curr.g + 1 + turnCost
      open.push({ cx: nx, cy: ny, g: ng, f: ng + heur(nx, ny), dir: d, parent: curr })
    }
  }
  return null
}

// Render a polyline with rounded right-angle corners. Identical to the
// step-wire path builder but pulled out so the outward-wraparound path
// can share the same look — small radius `R` quadratic-bezier turns at
// every interior vertex, with straight L segments between.
//
// Picks ONE radius for every corner in the polyline so close-together
// turns don't pop in/out at different sizes. The radius is capped at
// `R` and shrunk to fit the tightest segment in the polyline — each
// interior segment has a corner taking `r` from both ends (so it needs
// to be at least 2r long), and end segments give up `r` to their one
// adjacent corner (so they need to be at least r long).
export function roundedPolylinePath(pts: Pt[]): string {
  if (pts.length < 2) return ''
  // Drop interior points that are collinear with their neighbours — the
  // route planner emits stubFrom / stubTo / lane-edge intermediates that
  // lie on the same line as the surrounding vertices (180° "corners"),
  // and leaving them in fragments long segments into short ones, which
  // drags the per-wire uniformR way down. After this pass the polyline
  // has exactly the real geometric corners, so the radius budget reflects
  // actual bends instead of degenerate 180° points.
  const simplified: Pt[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = simplified[simplified.length - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = curr.x - prev.x
    const v1y = curr.y - prev.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    // Collinear when the 2D cross product is zero. Same-direction
    // (180° straight) and zero-length segments both fall through here,
    // which is what we want — neither needs its own polyline vertex.
    if (Math.abs(v1x * v2y - v1y * v2x) < 1e-6) continue
    simplified.push(curr)
  }
  simplified.push(pts[pts.length - 1]!)
  pts = simplified
  if (pts.length === 2) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`
  // Lower target radius so the per-wire uniformR doesn't have to shrink as
  // much when nodes are close — close-node wires used to bottom out at
  // R≈3 (gap 6) while wires between far nodes sat at R=12, which read as
  // visually inconsistent across wires on the same canvas. A target of 8
  // keeps the typical wire looking rounded while compressing the cross-
  // wire variance: long wires now stop at 8 instead of 12, and close-node
  // wires usually still hit the same 8 because their shortest segment is
  // longer than 16. Only very tight layouts (gap < 16) shrink further.
  const R = 8
  let uniformR = R
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const cornersOnSegment = (i > 0 ? 1 : 0) + (i < pts.length - 2 ? 1 : 0)
    if (cornersOnSegment === 0) continue
    uniformR = Math.min(uniformR, len / cornersOnSegment)
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = prev.x - curr.x
    const v1y = prev.y - curr.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const len1 = Math.max(1, Math.hypot(v1x, v1y))
    const len2 = Math.max(1, Math.hypot(v2x, v2y))
    const r = uniformR
    const ax = curr.x + (v1x / len1) * r
    const ay = curr.y + (v1y / len1) * r
    const bx = curr.x + (v2x / len2) * r
    const by = curr.y + (v2y / len2) * r
    d += ` L ${ax} ${ay} Q ${curr.x} ${curr.y}, ${bx} ${by}`
  }
  const last = pts[pts.length - 1]!
  d += ` L ${last.x} ${last.y}`
  return d
}

// Public wrapper used by every wire renderer (resting + in-flight previews).
// Tries the orthogonal candidate planner first, falls back to A* for the
// awkward layouts where every candidate clips an obstacle, then finally
// to the raw step staircase via `buildWirePath` so something always renders.
export function routedWirePath(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): string {
  const wrapPts =
    planOrthogonalRoute(p1, p2, fromSide, toSide, obstacles)
    ?? aStarOrthogonalRoute(p1, p2, fromSide, toSide, obstacles)
  if (wrapPts) return roundedPolylinePath(wrapPts)
  return buildWirePath(p1, p2, fromSide, toSide)
}

// Step staircase fallback: orthogonal right-angle path with curved corners.
// Depart from p1 along its outward normal, travel horizontally or vertically
// to an intermediate row / column, then arrive at p2 along its inward normal.
// Shares `roundedPolylinePath` with the wraparound planner for uniform corner
// radius.
export function buildWirePath(p1: Pt, p2: Pt, fromSide: Side, toSide: Side): string {
  return roundedPolylinePath(wireWaypoints(p1, p2, fromSide, toSide))
}
