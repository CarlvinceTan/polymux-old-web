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

const metrics = jiti('./workflowLayoutMetrics.ts')
const layout = jiti('./useWorkflowLayout.ts')

const {
  estimateNodeSize,
  clampIntermediateColumns,
  enforceIntermediateHorizontalBetween,
  resolveLayoutOverlaps,
  computeAutoLayoutGeometry,
  NODE_W,
  TERMINAL_W,
} = metrics

const { buildLayout, buildAutoLayoutGeometry, WORKFLOW_START_ID, WORKFLOW_END_ID } = layout

test('estimateNodeSize grows width for long titles', () => {
  const short = estimateNodeSize({ id: 'a', title: 'Hi' })
  assert.equal(short.w, NODE_W)

  const long = estimateNodeSize({
    id: 'b',
    title: 'A much longer workflow step title that should expand the card',
  })
  assert.ok(long.w > NODE_W)
  assert.ok(long.w % 48 === 0)
})

test('clampIntermediateColumns keeps real nodes off terminal columns', () => {
  const nodes = [
    { id: WORKFLOW_START_ID, node: { id: WORKFLOW_START_ID }, col: 0, row: 0, displayState: 'active', terminal: 'start' },
    { id: 'a', node: { id: 'a' }, col: 0, row: 1, displayState: 'active' },
    { id: 'b', node: { id: 'b' }, col: 4, row: 0, displayState: 'active' },
    { id: WORKFLOW_END_ID, node: { id: WORKFLOW_END_ID }, col: 4, row: 0, displayState: 'active', terminal: 'end' },
  ]
  clampIntermediateColumns(nodes, 3)
  assert.equal(nodes[1].col, 1)
  assert.equal(nodes[2].col, 3)
  assert.equal(nodes[0].col, 0)
  assert.equal(nodes[3].col, 4)
})

test('enforceIntermediateHorizontalBetween clamps centers between terminals', () => {
  const rects = [
    { id: WORKFLOW_START_ID, x: 0, y: 0, w: TERMINAL_W, h: 48, terminal: 'start' },
    { id: 'left', x: -200, y: 0, w: NODE_W, h: 96 },
    { id: 'right', x: 900, y: 0, w: NODE_W, h: 96 },
    { id: WORKFLOW_END_ID, x: 800, y: 0, w: TERMINAL_W, h: 48, terminal: 'end' },
  ]
  enforceIntermediateHorizontalBetween(rects)
  const startCx = rects[0].x + rects[0].w / 2
  const endCx = rects[3].x + rects[3].w / 2
  for (const id of ['left', 'right']) {
    const r = rects.find(x => x.id === id)
    const cx = r.x + r.w / 2
    assert.ok(cx > startCx)
    assert.ok(cx < endCx)
  }
})

test('resolveLayoutOverlaps separates stacked nodes', () => {
  const rects = [
    { id: 'a', x: 100, y: 100, w: NODE_W, h: 96 },
    { id: 'b', x: 120, y: 130, w: NODE_W, h: 96 },
  ]
  resolveLayoutOverlaps(rects)
  const overlap = rects[0].x < rects[1].x + rects[1].w
    && rects[0].x + rects[0].w > rects[1].x
    && rects[0].y < rects[1].y + rects[1].h
    && rects[0].y + rects[0].h > rects[1].y
  assert.equal(overlap, false)
})

test('buildAutoLayoutGeometry places fan-out between start and end', () => {
  const graph = {
    nodes: [
      { id: 'source', title: 'Source' },
      { id: 'upper', title: 'Upper' },
      { id: 'lower', title: 'Lower' },
    ],
    wires: [
      { id: 'w1', from_id: 'source', to_id: 'upper' },
      { id: 'w2', from_id: 'source', to_id: 'lower' },
    ],
  }
  const geom = buildAutoLayoutGeometry(graph)
  const layoutModel = buildLayout(graph)
  const start = layoutModel.nodes.find(n => n.id === WORKFLOW_START_ID)
  const end = layoutModel.nodes.find(n => n.id === WORKFLOW_END_ID)
  const startGeom = geom.find(g => g.id === WORKFLOW_START_ID)
  const endGeom = geom.find(g => g.id === WORKFLOW_END_ID)
  const startCx = startGeom.position.x + startGeom.size.w / 2
  const endCx = endGeom.position.x + endGeom.size.w / 2

  for (const node of graph.nodes) {
    const item = geom.find(g => g.id === node.id)
    assert.ok(item, `missing geometry for ${node.id}`)
    const cx = item.position.x + item.size.w / 2
    assert.ok(cx > startCx, `${node.id} should sit right of Start`)
    assert.ok(cx < endCx, `${node.id} should sit left of End`)
    assert.ok(item.size.w >= NODE_W)
  }

  assert.ok(start.col === 0)
  assert.ok(end.col > start.col)
})
