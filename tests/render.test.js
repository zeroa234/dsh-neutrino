import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRenderParams } from '../lib/lib/render.js'

test('buildRenderParams: model 映射到 modelDir', () => {
  const p = buildRenderParams({ model: 'ZUNDAMON' })
  assert.equal(p.modelDir, 'ZUNDAMON')
  assert.equal(p.model, undefined)
})

test('buildRenderParams: supportModel 映射到 supportModelDir', () => {
  const p = buildRenderParams({ supportModel: 'ITARU' })
  assert.equal(p.supportModelDir, 'ITARU')
})

test('buildRenderParams: defaultModel 兜底，显式 model 优先', () => {
  const fallback = buildRenderParams({}, 'ZUNDAMON')
  assert.equal(fallback.modelDir, 'ZUNDAMON')
  const explicit = buildRenderParams({ model: 'ITARU' }, 'ZUNDAMON')
  assert.equal(explicit.modelDir, 'ITARU')
})

test('buildRenderParams: 渲染参数透传，非渲染参数跳过', () => {
  const p = buildRenderParams({
    title: 'song',
    notes: ['C4:4:こ'],
    bpm: 100,
    styleShift: 5,
    transpose: -2,
    useGPU: false,
    gpuId: 1,
    phrase: 2,
  })
  assert.equal(p.styleShift, 5)
  assert.equal(p.transpose, -2)
  assert.equal(p.useGPU, false)
  assert.equal(p.gpuId, 1)
  assert.equal(p.phrase, 2)
  assert.equal(p.title, undefined)
  assert.equal(p.notes, undefined)
  assert.equal(p.bpm, undefined)
})

test('buildRenderParams: undefined/null 忽略', () => {
  const p = buildRenderParams({ model: undefined, supportModel: null, styleShift: undefined })
  assert.equal(p.modelDir, undefined)
  assert.equal(p.supportModelDir, undefined)
  assert.equal(p.styleShift, undefined)
})
