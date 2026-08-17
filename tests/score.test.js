import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNote, parseScore, buildMusicXML } from '../lib/lib/score.js'

test('parseNote: 基本音符 C4 四分 こ', () => {
  const n = parseNote('C4:4:こ')
  assert.equal(n.type, 'note')
  assert.equal(n.step, 'C')
  assert.equal(n.octave, 4)
  assert.equal(n.divisions, 480)
  assert.equal(n.lyric, 'こ')
})

test('parseNote: 升号与八分', () => {
  const n = parseNote('F#3:8:ん')
  assert.equal(n.step, 'F')
  assert.equal(n.alter, 1)
  assert.equal(n.octave, 3)
  assert.equal(n.divisions, 240)
})

test('parseNote: 休止符', () => {
  const n = parseNote('R:4')
  assert.equal(n.type, 'rest')
  assert.equal(n.divisions, 480)
})

test('parseNote: 无歌词连音', () => {
  const n = parseNote('C4:2')
  assert.equal(n.type, 'note')
  assert.equal(n.lyric, null)
  assert.equal(n.divisions, 960)
})

test('parseNote: 附点', () => {
  const n = parseNote('C4:4.:こ')
  assert.equal(n.divisions, 720) // 480 * 1.5
})

test('parseNote: 精确 tick', () => {
  const n = parseNote('C4:t1112:こ')
  assert.equal(n.divisions, 1112)
})

test('parseNote: 换气记号', () => {
  const n = parseNote('|')
  assert.equal(n.type, 'breath')
})

test('parseNote: 非法 token 报错', () => {
  assert.throws(() => parseNote('X9:4:こ'))
})

test('parseScore: 多行文本', () => {
  const tokens = parseScore('# 注释\nC4:4:こ D4:8:ん\nR:4 |\nE4:4:に')
  assert.deepEqual(tokens, ['C4:4:こ', 'D4:8:ん', 'R:4', 'E4:4:に'])
})

test('buildMusicXML: 基本结构', () => {
  const xml = buildMusicXML({ title: 'test', notes: ['C4:4:こ', 'D4:4:ん'], bpm: 100 })
  assert.ok(xml.includes('<work-title>test</work-title>'))
  assert.ok(xml.includes('<per-minute>100</per-minute>'))
  assert.ok(xml.includes('<step>C</step>'))
  assert.ok(xml.includes('<text>こ</text>'))
  assert.ok(xml.includes('<text>ん</text>'))
  assert.ok(xml.includes('<measure number="1"'))
})

test('buildMusicXML: 休止生成 rest', () => {
  const xml = buildMusicXML({ title: 't', notes: ['C4:4:こ', 'R:4'] })
  assert.ok(xml.includes('<rest/>'))
})

test('buildMusicXML: 跨小节长音符拆分+tie', () => {
  // 4/4 拍，四分(1拍) + 全音符(4拍) = 5 拍 → 全音符跨小节线
  const xml = buildMusicXML({ title: 't', notes: ['C4:4:こ', 'C4:1:ん'], beatsPerMeasure: 4 })
  // 第二小节存在
  assert.ok(xml.includes('<measure number="2"'))
  // 跨小节拆分产生 tie start/stop
  assert.ok(xml.includes('<tie type="start"/>'))
  assert.ok(xml.includes('<tie type="stop"/>'))
})

test('buildMusicXML: 无歌词+同音高自动 tie', () => {
  const xml = buildMusicXML({ title: 't', notes: ['C4:4:こ', 'C4:4', 'C4:4:ん'] })
  // 第二个音符无歌词、与前后同音高 → 应生成 tie start/stop
  assert.ok(xml.includes('<tie type="start"/>'))
  assert.ok(xml.includes('<tie type="stop"/>'))
})
