/**
 * render.ts — NEUTRINO 合成管线执行：MusicXML → label → f0/melspec → WAV。
 *
 * 依赖 engine.ts 的安装定位与声库枚举；自身只负责「参数装配 + 子进程执行」。
 * 直接驱动官方 CLI（musicXMLtoLabel.exe / neutrino.exe），不依赖任何 GUI 自动化。
 */
import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { findInstall, isWindows, listVoicebanks, NeutrinoError } from './engine.js'

/** 渲染参数（与 neutrino.exe CLI 一一对应；undefined 表示不传） */
export interface RenderParams {
  modelDir?: string | null
  supportModelDir?: string | null
  styleShift?: number
  transpose?: number
  numThreads?: number
  bitDepth?: string | number
  samplingRate?: number
  useGPU?: boolean
  gpuId?: number
  skipTiming?: boolean
  skipF0?: boolean
  skipMelspec?: boolean
  skipWav?: boolean
  phrase?: number
  phraseList?: string
}

export const DEFAULT_PARAMS: RenderParams = {
  modelDir: null,
  supportModelDir: null,
  styleShift: 2,
  transpose: 0,
  numThreads: 0,
  bitDepth: 16,
  samplingRate: 48000,
  useGPU: true,
}

/** 工具入参中属于渲染参数的白名单（其余如 title/notes/bpm 跳过） */
const RENDER_KEYS: ReadonlySet<string> = new Set([
  'styleShift', 'transpose', 'numThreads', 'bitDepth', 'samplingRate',
  'useGPU', 'gpuId', 'skipTiming', 'skipF0', 'skipMelspec', 'skipWav', 'phrase',
])

/**
 * 从工具入参构建渲染参数（参数名映射 + 默认声库兜底）。
 * 工具 schema 用 `model` / `supportModel`（用户友好命名），
 * 内部 CLI 用 `modelDir` / `supportModelDir`——这里完成映射，
 * 避免出现"用户指定了声库却被静默忽略"的死参数。
 */
export function buildRenderParams(args: Record<string, unknown>, defaultModel?: string | null): RenderParams {
  const params: RenderParams = {}
  for (const k of Object.keys(args)) {
    const v = args[k]
    if (v === undefined || v === null) continue
    if (k === 'model') params.modelDir = String(v)
    else if (k === 'supportModel') params.supportModelDir = String(v)
    else if (RENDER_KEYS.has(k)) (params as Record<string, unknown>)[k] = v
  }
  if (defaultModel && !params.modelDir) params.modelDir = defaultModel
  return params
}

export interface RenderResult {
  code: number
  stdout: string
  stderr: string
  step: 'musicXMLtoLabel' | 'neutrino'
  modelDir: string
  wav: string | null
  ok: boolean
  error?: string
}

export interface RenderOptions {
  basename: string
  params?: RenderParams
  dir?: string | null
  onProgress?: (chunk: string) => void
}

/**
 * 渲染一个已存在的乐谱（basename 无扩展名，须在 score/musicxml/ 下）。
 * 步骤：musicXMLtoLabel → NEUTRINO(label→f0/melspec) → vocoder(→wav)。
 */
export async function render({ basename, params = {}, dir = null, onProgress }: RenderOptions): Promise<RenderResult> {
  const install = dir || findInstall()
  if (!install) throw new NeutrinoError('NEUTRINO install not found')
  const p: RenderParams = { ...DEFAULT_PARAMS, ...params }
  const exe = path.join(install, 'bin', isWindows() ? 'neutrino.exe' : 'neutrino')
  const toLabel = path.join(install, 'bin', isWindows() ? 'musicXMLtoLabel.exe' : 'musicXMLtoLabel')
  for (const f of [exe, toLabel]) {
    if (!existsSync(f)) throw new NeutrinoError(`Missing binary: ${f}`)
  }

  // 决定声库（未指定时自动选第一个已安装）
  let modelDir = p.modelDir
  if (!modelDir) {
    const banks = listVoicebanks(install)
    if (!banks.length) throw new NeutrinoError('No voicebank installed in model/')
    modelDir = banks[0].name
  }
  const modelPath = path.join(install, 'model', modelDir) + path.sep
  if (!existsSync(modelPath)) throw new NeutrinoError(`Voicebank not found: ${modelPath}`)

  const labelFull = path.join(install, 'score', 'label', 'full', `${basename}.lab`)
  const labelMono = path.join(install, 'score', 'label', 'mono', `${basename}.lab`)
  const labelTiming = path.join(install, 'score', 'label', 'timing', `${basename}.lab`)
  for (const d of [path.dirname(labelFull), path.dirname(labelTiming)]) {
    await fs.mkdir(d, { recursive: true })
  }

  const scoreFile = path.join(install, 'score', 'musicxml', `${basename}.musicxml`)
  if (!existsSync(scoreFile)) throw new NeutrinoError(`Score not found: ${scoreFile}`)

  // step 1: score → label
  const step1 = await runExe(toLabel, [scoreFile, labelFull, labelMono], install, onProgress)
  if (step1.code !== 0) {
    return { ...step1, step: 'musicXMLtoLabel', modelDir, wav: null, ok: false }
  }

  // step 2: label → 歌声
  const outF0 = path.join(install, 'output', `${basename}.f0`)
  const outMel = path.join(install, 'output', `${basename}.melspec`)
  const outWav = path.join(install, 'output', `${basename}.wav`)
  const args = [labelFull, labelTiming, outF0, outMel, outWav, modelPath]
  args.push('-n', String(p.numThreads || 0))
  if (p.styleShift != null) args.push('-k', String(p.styleShift))
  if (p.transpose != null) args.push('-f', String(p.transpose))
  if (p.samplingRate != null) args.push('-s', String(p.samplingRate))
  if (p.bitDepth != null) args.push('-b', String(p.bitDepth))
  if (p.supportModelDir) args.push('-S', path.join(install, 'model', p.supportModelDir) + path.sep)
  if (p.skipTiming) args.push('--skip-timing')
  if (p.skipF0) args.push('--skip-f0')
  if (p.skipMelspec) args.push('--skip-melspec')
  if (p.skipWav) args.push('--skip-wav')
  if (p.phrase != null) args.push('-p', String(p.phrase))
  if (p.gpuId != null && p.gpuId >= 0) args.push('-g', String(p.gpuId))
  else if (p.useGPU !== false) args.push('-m') // 最优 GPU（无 GPU 自动回落 CPU）
  if (p.phraseList) args.push('-i', p.phraseList)

  const step2 = await runExe(exe, args, install, onProgress)
  return {
    ...step2,
    step: 'neutrino',
    modelDir,
    wav: existsSync(outWav) ? outWav : null,
    ok: step2.code === 0 && existsSync(outWav),
  }
}

function runExe(program: string, args: string[], cwd: string, onProgress?: (chunk: string) => void): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { const s = d.toString('utf8'); stdout += s; onProgress?.(s) })
    child.stderr.on('data', (d: Buffer) => { const s = d.toString('utf8'); stderr += s; onProgress?.(s) })
    child.on('error', (e) => resolve({ code: -1, stdout, stderr }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}
