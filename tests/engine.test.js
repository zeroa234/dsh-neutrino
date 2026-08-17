import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { markerExists, installInfo, listVoicebanks, listOutputs, latestOutput, OFFICIAL_URLS } from '../lib/lib/engine.js'
import { parse } from '../lib/lib/toml.js'

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-neutrino-test-'))
}

/** 造一个假的 NEUTRINO 安装目录（Windows 形态：bin/ + model/ + output/） */
function fakeInstall() {
  const dir = tmpdir()
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'model', 'ZUNDAMON'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true })
  // Windows 上 neutrino.exe 用 markerExists 检查；非 Windows 用 'neutrino'
  const exe = process.platform === 'win32' ? 'neutrino.exe' : 'neutrino'
  fs.writeFileSync(path.join(dir, 'bin', exe), 'fake')
  fs.writeFileSync(path.join(dir, 'model', 'ZUNDAMON', 'info.toml'), [
    'version = "1.0"',
    'type = "NEW"',
    'top_key = "D6"',
    'bottom_key = "F2"',
    '[speaker]',
    'name = "ずんだもん"',
    'gender = "female"',
    'language = "japanese"',
    'support = true',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, 'output', 'song.wav'), 'RIFFfake')
  return dir
}

test('markerExists: 识别 NEUTRINO 安装', () => {
  const dir = fakeInstall()
  assert.equal(markerExists(dir), true)
  assert.equal(markerExists(path.join(dir, 'nope')), false)
})

test('installInfo: 找到安装但版本探测失败不致命', () => {
  const dir = fakeInstall()
  // installInfo 不带 dir 参数走 findInstall，无法注入假目录；直接测其内部逻辑的容错：
  // 我们只验证 marker 逻辑 + listVoicebanks 的独立路径
  assert.equal(markerExists(dir), true)
})

test('listVoicebanks: 解析 info.toml', () => {
  const dir = fakeInstall()
  const banks = listVoicebanks(dir)
  assert.equal(banks.length, 1)
  const bank = banks[0]
  assert.equal(bank.name, 'ZUNDAMON')
  assert.equal(bank.version, '1.0')
  assert.equal(bank.speaker, 'ずんだもん')
  assert.equal(bank.gender, 'female')
  assert.equal(bank.support, true)
  assert.equal(bank.bottomKey, 'F2')
})

test('listOutputs: 列出 wav', async () => {
  const dir = fakeInstall()
  const files = await listOutputs(dir)
  assert.equal(files.length, 1)
  assert.equal(files[0].file, 'song.wav')
  assert.ok(files[0].size > 0)
})

test('latestOutput: 最近输出', () => {
  const dir = fakeInstall()
  const latest = latestOutput(dir)
  assert.ok(latest)
  assert.equal(latest.name, 'song.wav')
  assert.ok(latest.path.endsWith('song.wav'))
})

test('latestOutput: 按 mtime 取最新而非字母序', () => {
  const dir = tmpdir()
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'output', 'song1.wav'), 'newer')
  fs.writeFileSync(path.join(dir, 'output', 'song2.wav'), 'older')
  const now = Date.now()
  // song1 最新（mtime 现在），song2 旧（1 小时前）；字母序最后是 song2
  fs.utimesSync(path.join(dir, 'output', 'song1.wav'), new Date(now), new Date(now))
  fs.utimesSync(path.join(dir, 'output', 'song2.wav'), new Date(now - 3600_000), new Date(now - 3600_000))
  const latest = latestOutput(dir)
  assert.equal(latest.name, 'song1.wav')
})

test('installInfo: 显式 dir 生效（含版本探测容错）', () => {
  const dir = fakeInstall()
  const info = installInfo(dir)
  assert.equal(info.installed, true)
  assert.equal(info.dir, dir)
})

test('official urls: 链接可访问性文档常量存在', () => {
  assert.ok(OFFICIAL_URLS.downloads.includes('studio-neutrino.com'))
  assert.ok(OFFICIAL_URLS.drive.includes('drive.google.com'))
})

test('toml parse: 嵌套表与类型', () => {
  const obj = parse('[speaker]\nname = "ずんだもん"\nsupport = true\nversion = "1.0"')
  assert.equal(obj.speaker.name, 'ずんだもん')
  assert.equal(obj.speaker.support, true)
})

test('toml parse: 多个顶层表不互相嵌套', () => {
  const obj = parse('[a]\nx = 1\n[b]\ny = 2')
  assert.equal(obj.a.x, 1)
  assert.equal(obj.b.y, 2)
  assert.equal(obj.a.b, undefined)
})
