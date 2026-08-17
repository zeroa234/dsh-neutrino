/**
 * @dsh-external/dsh-neutrino — STUDIO NEUTRINO 歌声合成引擎控制插件。
 *
 * 设计原则（用户要求）：
 * - 用户友好：缺引擎时工具不罢工——乐谱类工具照常可用，合成类工具给出
 *   官方下载引导（链接已实测验证），而不是一句 "not found"。
 * - 无冗余：去掉 MCP 版里重复的 set_params（写入不参与渲染的信息文件）与
 *   run_command（agent 自带 shell，无需重复暴露任意命令执行）。
 * - 高内聚低耦合：引擎定位/声库（engine.ts）、乐谱生成（score.ts）、
 *   渲染管线（render.ts）、TOML 解析（toml.ts）各司其职，index.ts 只做装配。
 * - 官方格式：ctx.effect 注册资源（热重载/卸载自动清理），工具名唯一前缀。
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { ENGINE_GUIDE, findInstall, installInfo, installVoicebank, listOutputs, listVoicebanks, latestOutput, scoreDir } from './lib/engine.js'
import { buildMusicXML } from './lib/score.js'
import { buildRenderParams, render, type RenderResult } from './lib/render.js'

export const name = '@dsh-external/dsh-neutrino'
export const inject = ['tools']

export interface Config {
  /** NEUTRINO 安装目录（缺省自动探测：NEUTRINO_DIR 环境变量 → 各盘符根目录） */
  neutrinoDir?: string
  /** 默认声库名（缺省自动选第一个已安装声库） */
  defaultModel?: string
  /** 无引擎时乐谱暂存目录 */
  scoreDir: string
}

export const Config = z.object({
  neutrinoDir: z.string(),
  defaultModel: z.string(),
  scoreDir: z.string().default('~/.dsh-neutrino/scores'),
})

// 工具注册名统一使用 _dsh_external_dsh_neutrino_* 全名（harness 无名字缩短机制，模型所见即所注册）
const TOOL = {
  status: '_dsh_external_dsh_neutrino_status',
  listVoicebanks: '_dsh_external_dsh_neutrino_list_voicebanks',
  installVoicebank: '_dsh_external_dsh_neutrino_install_voicebank',
  createScore: '_dsh_external_dsh_neutrino_create_score',
  renderScore: '_dsh_external_dsh_neutrino_render_score',
  synthesizeSong: '_dsh_external_dsh_neutrino_synthesize_song',
  listOutputs: '_dsh_external_dsh_neutrino_list_outputs',
} as const

/** 文本输出的统一 render 样板 */
const textOut = {
  schema: { type: 'string' } as const,
  render: (_a: unknown, v: unknown) => [{ type: 'text' as const, text: String(v) }],
}

/** 引擎缺失时的统一错误文案（status 之外的工具复用） */
function engineMissingText(): string {
  return ENGINE_GUIDE
}

/** 渲染参数 schema（render_score / synthesize_song 共用，避免两处重复维护） */
const renderParamsSchema = {
  model: { type: 'string', description: '声库文件夹名（缺省自动选第一个）' },
  supportModel: { type: 'string', description: '支持声库（音色融合，需声库 support=true）' },
  styleShift: { type: 'number', description: '情感强度 -55..+55，缺省 2' },
  transpose: { type: 'number', description: '整体移调（半音）' },
  numThreads: { type: 'number', description: 'CPU 线程数，0=自动' },
  bitDepth: { type: 'string', description: 'WAV 位深 8|16|24|32|float' },
  samplingRate: { type: 'number', description: '采样率 Hz，缺省 48000' },
  useGPU: { type: 'boolean', description: '优先 NVIDIA GPU（无 GPU 自动回落 CPU）' },
  gpuId: { type: 'number', description: '指定 GPU 设备号' },
  skipTiming: { type: 'boolean', description: '跳过时序预测，使用已有 timing .lab' },
  skipF0: { type: 'boolean', description: '跳过基频预测' },
  skipMelspec: { type: 'boolean', description: '跳过频谱预测' },
  skipWav: { type: 'boolean', description: '跳过波形生成（只出 f0/melspec）' },
  phrase: { type: 'number', description: '只渲染第 N 个乐句（1 起）' },
} as const

/** 渲染结果文本：退出码 + 成败 + stdout/stderr 尾部（render_score / synthesize_song 共用） */
function formatRenderResult(result: RenderResult, extra: string[] = []): string {
  const tail = 20
  return [
    ...extra,
    `Exit code: ${result.code}`,
    result.ok ? `OK → WAV: ${result.wav}` : 'FAILED (see log below)',
    '--- stdout tail ---',
    (result.stdout.split('\n').slice(-tail).join('\n') || '(empty)'),
    '--- stderr tail ---',
    (result.stderr.split('\n').slice(-tail).join('\n') || '(empty)'),
  ].join('\n')
}

/** 把 MusicXML 写入目标目录（引擎 score 目录；无引擎时写暂存目录） */
async function writeScoreFile(
  title: string,
  notes: string[],
  opts: { bpm?: number; beatsPerMeasure?: number; install: string | null; fallbackDir: string },
): Promise<{ file: string; engineFound: boolean }> {
  const xml = buildMusicXML({ title, notes, bpm: opts.bpm ?? 120, beatsPerMeasure: opts.beatsPerMeasure ?? 4 })
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
  const engineDir = opts.install ? scoreDir(opts.install) : null
  const dir = engineDir ?? opts.fallbackDir
  await fs.promises.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${safeTitle}.musicxml`)
  await fs.promises.writeFile(file, xml, 'utf8')
  return { file, engineFound: engineDir !== null }
}

/** 展开 ~ 为用户主目录 */
function expandHome(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(1)) : p
}

export function apply(ctx: Context, config: Config): void {

  // ── 状态：安装信息 / 声库 / 最近输出；缺引擎时给官方下载引导 ──────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.status,
    description: '检查 STUDIO NEUTRINO 安装状态（版本/声库/最近输出）。未安装时返回官方下载引导。',
    parameters: {},
    output: textOut,
    async execute() {
      const info = installInfo(config.neutrinoDir)
      if (!info.installed) return engineMissingText()
      const banks = listVoicebanks(info.dir)
      const latest = latestOutput(info.dir)
      const dirNote = config.neutrinoDir ? `（配置指定 ${config.neutrinoDir}）` : ''
      return JSON.stringify({
        installed: true,
        dir: info.dir,
        version: info.version,
        voicebanks: banks,
        latestOutput: latest,
        config: dirNote,
      }, null, 2)
    },
  })), '@dsh-external/dsh-neutrino: status')

  // ── 声库列表 ────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.listVoicebanks,
    description: '列出已安装的 NEUTRINO 声库（model/ 目录，含名称/版本/音域/support 标志）。引擎缺失时返回下载引导。',
    parameters: {},
    output: textOut,
    async execute() {
      const install = findInstall(config.neutrinoDir)
      if (!install) return engineMissingText()
      const banks = listVoicebanks(install)
      return JSON.stringify(banks, null, 2)
    },
  })), '@dsh-external/dsh-neutrino: list_voicebanks')

  // ── 声库安装（zip → model/） ─────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.installVoicebank,
    description: '从本地官方声库 zip 安装到 model/（自动识别 zip 内声库目录层级）。引擎缺失时返回下载引导。',
    parameters: {
      zip: { type: 'string', required: true, description: '声库 zip 的本地绝对路径' },
    },
    output: textOut,
    async execute(args: { zip: string }) {
      if (!fs.existsSync(args.zip)) return `zip not found: ${args.zip}`
      const install = findInstall(config.neutrinoDir)
      if (!install) return engineMissingText()
      try {
        const r = await installVoicebank(args.zip, install)
        return `Installed: ${r.installed.join(', ') || '(none found — check zip layout)'}`
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    },
  })), '@dsh-external/dsh-neutrino: install_voicebank')

  // ── 乐谱生成（无引擎也可用，写暂存目录） ────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.createScore,
    description: '由「音高:时值:歌词」音符串生成 NEUTRINO MusicXML 乐谱。格式如 "C4:4:こ"，"R:4" 休止，"C4:4" 无歌词连音。无需引擎即可生成。',
    parameters: {
      title: { type: 'string', required: true, description: '曲名' },
      notes: { type: 'array', required: true, items: { type: 'string' }, description: '音符 token 列表，如 ["C4:4:こ","D4:8:ん","R:4"]' },
      bpm: { type: 'number', description: '速度，缺省 120' },
      beatsPerMeasure: { type: 'number', description: '每小节拍数，缺省 4' },
    },
    output: textOut,
    async execute(args: { title: string; notes: string[]; bpm?: number; beatsPerMeasure?: number }) {
      const install = findInstall(config.neutrinoDir)
      const fallback = expandHome(config.scoreDir)
      const { file, engineFound } = await writeScoreFile(args.title, args.notes, { bpm: args.bpm, beatsPerMeasure: args.beatsPerMeasure, install, fallbackDir: fallback })
      const engineNote = engineFound ? '' : `\n（引擎未安装：乐谱已写入暂存目录 ${fallback}，安装引擎后可复制到 <NEUTRINO>/score/musicxml/ 或直接重新生成）`
      return `Score written: ${file}${engineNote}`
    },
  })), '@dsh-external/dsh-neutrino: create_score')

  // ── 渲染指定乐谱 ─────────────────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.renderScore,
    description: '渲染已存在的乐谱（musicxml basename，位于引擎 score/musicxml/）：label → AI 推理 → vocoder → WAV。引擎缺失时返回下载引导。',
    parameters: {
      basename: { type: 'string', required: true, description: '乐谱文件名（无扩展名）' },
      ...renderParamsSchema,
    },
    output: textOut,
    async execute(args: Record<string, unknown>) {
      const install = findInstall(config.neutrinoDir)
      if (!install) return engineMissingText()
      const basename = String(args.basename).replace(/\.musicxml$/i, '')
      const scoreDirPath = scoreDir(install)
      if (!scoreDirPath || !fs.existsSync(path.join(scoreDirPath, `${basename}.musicxml`))) {
        const available = scoreDirPath && fs.existsSync(scoreDirPath) ? fs.readdirSync(scoreDirPath).join(', ') : '(none)'
        return `Score not found: ${basename}. Available: ${available}`
      }
      try {
        const result = await render({ basename, params: buildRenderParams(args, config.defaultModel), dir: install })
        return formatRenderResult(result)
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    },
  })), '@dsh-external/dsh-neutrino: render_score')

  // ── 一站式：乐谱生成 + 渲染 ──────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.synthesizeSong,
    description: '一站式歌声合成：给出歌词+旋律直接渲染 WAV（create_score + render_score 合并）。引擎缺失时返回下载引导。',
    parameters: {
      title: { type: 'string', required: true, description: '曲名' },
      notes: { type: 'array', required: true, items: { type: 'string' }, description: '音符 token：如 ["C4:4:こ","D4:8:ん","R:4"]' },
      bpm: { type: 'number', description: '速度，缺省 120' },
      beatsPerMeasure: { type: 'number', description: '每小节拍数，缺省 4' },
      ...renderParamsSchema,
    },
    output: textOut,
    async execute(args: Record<string, unknown>) {
      const install = findInstall(config.neutrinoDir)
      if (!install) return engineMissingText()
      const title = String(args.title || 'song')
      const tokens = Array.isArray(args.notes) ? args.notes as string[] : []
      const fallback = expandHome(config.scoreDir)
      const { file } = await writeScoreFile(title, tokens, { bpm: args.bpm as number | undefined, beatsPerMeasure: args.beatsPerMeasure as number | undefined, install, fallbackDir: fallback })
      try {
        const basename = path.basename(file, '.musicxml')
        const result = await render({ basename, params: buildRenderParams(args, config.defaultModel), dir: install })
        return formatRenderResult(result, [`Score: ${file}`])
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    },
  })), '@dsh-external/dsh-neutrino: synthesize_song')

  // ── 输出列表 ─────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL.listOutputs,
    description: '列出 NEUTRINO output/ 下已渲染的 WAV（按时间倒序）。引擎缺失时返回空列表。',
    parameters: {},
    output: textOut,
    async execute() {
      const files = await listOutputs(findInstall(config.neutrinoDir))
      return JSON.stringify(files, null, 2)
    },
  })), '@dsh-external/dsh-neutrino: list_outputs')
}
