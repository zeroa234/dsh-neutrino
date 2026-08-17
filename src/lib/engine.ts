/**
 * engine.ts — STUDIO NEUTRINO 引擎定位、状态、声库与输出管理。
 * 高内聚：所有「引擎本体在哪/装了什么/输出了什么」都在这里；不依赖 DSH 工具层。
 *
 * NEUTRINO 是用户自备的外部运行时（引擎免费，官方下载；声库各有各的利用規約，
 * 插件不打包、不代发）。本模块负责：定位安装 → 读取状态 → 管理声库 → 列出输出。
 */
import { spawnSync } from 'node:child_process'
import { promises as fs, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseToml, type TomlObject } from './toml.js'

// ── 官方下载引导（2026 实测有效；单点维护，工具报错与 README 共用）─────────────
export const OFFICIAL_URLS = {
  site: 'https://studio-neutrino.com/',
  downloads: 'https://studio-neutrino.com/downloads/',
  drive: 'https://drive.google.com/drive/folders/1cDicMle0z0y6zRLbQp3dD2kI-Zn21YHC',
} as const

/** 引擎缺失时给用户的引导文案（status / render 报错共用） */
export const ENGINE_GUIDE = [
  'NEUTRINO 引擎未安装。',
  `官方下载页：${OFFICIAL_URLS.downloads}`,
  `文件直链（Google Drive）：${OFFICIAL_URLS.drive}`,
  '步骤：下载 Windows 版 zip → 解压 → 设置 NEUTRINO_DIR 环境变量（或在插件配置中填 neutrinoDir）→ 重启会话。',
  '声库（可选）：从同一下载页获取角色声库 zip，用 install_voicebank 工具导入。',
].join('\n')

export function isWindows(): boolean {
  return process.platform === 'win32'
}

// ---------------------------------------------------------------------------
// 安装定位
// ---------------------------------------------------------------------------

export interface InstallInfo {
  installed: boolean
  dir: string | null
  version?: string
  error?: string
}

let cachedInstall: string | null = null

/**
 * 定位 NEUTRINO 安装目录。
 * 优先级：显式 dir 参数 → 环境变量 NEUTRINO_DIR → 各盘符根目录浅扫描。
 * 不做任何硬编码绝对路径（公开发布要求）。
 */
export function findInstall(dir?: string | null, force = false): string | null {
  if (dir) return markerExists(dir) ? dir : null
  if (cachedInstall && !force) return cachedInstall
  const candidates: string[] = []
  if (process.env.NEUTRINO_DIR) candidates.push(process.env.NEUTRINO_DIR)
  if (isWindows()) {
    // 浅扫描各盘符根目录下的 NEUTRINO 文件夹（大小写变体）
    for (let d = 67; d <= 90; d++) { // D..Z（C 盘保留给系统，避免误扫）
      const drive = String.fromCharCode(d) + ':\\'
      if (!existsSync(drive)) continue
      for (const entry of ['NEUTRINO', 'neutrino', 'Neutrino']) {
        const p = path.join(drive, entry)
        if (markerExists(p)) candidates.push(p)
      }
    }
  } else {
    candidates.push('/Applications/NEUTRINO.app/Contents/Resources', path.join(os.homedir(), 'NEUTRINO'))
  }
  for (const c of candidates) {
    if (markerExists(c)) {
      cachedInstall = c
      return c
    }
  }
  return null
}

export function markerExists(dir: string): boolean {
  try {
    if (!existsSync(dir)) return false
    const exe = isWindows() ? 'neutrino.exe' : 'neutrino'
    return existsSync(path.join(dir, 'bin', exe)) || existsSync(path.join(dir, exe)) ||
      existsSync(path.join(dir, 'Run.bat')) || existsSync(path.join(dir, 'Run.sh'))
  } catch {
    return false
  }
}

export function installInfo(dir?: string | null): InstallInfo {
  const install = findInstall(dir)
  if (!install) {
    return { installed: false, dir: null, error: 'NEUTRINO not found. Set NEUTRINO_DIR env var or plugin config neutrinoDir.' }
  }
  const exe = path.join(install, 'bin', isWindows() ? 'neutrino.exe' : 'neutrino')
  let version = 'unknown'
  try {
    const v = spawnSync(exe, ['-h'], { encoding: 'utf8', timeout: 15000 })
    const head = ((v.stdout || '') + (v.stderr || '')).split(/\r?\n/)[0] || ''
    if (head) version = head.trim()
  } catch { /* 版本探测失败不致命 */ }
  return { installed: true, dir: install, version }
}

// ---------------------------------------------------------------------------
// 声库管理
// ---------------------------------------------------------------------------

export interface VoiceBank {
  name: string
  dir: string
  version?: string
  type?: string
  topKey?: string
  bottomKey?: string
  speaker?: string
  gender?: string
  language?: string
  support?: boolean
}

export function listVoicebanks(dir: string | null = null): VoiceBank[] {
  const install = dir || findInstall()
  if (!install) return []
  const modelDir = path.join(install, 'model')
  if (!existsSync(modelDir)) return []
  const banks: VoiceBank[] = []
  for (const entry of readdirSync(modelDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bankDir = path.join(modelDir, entry.name)
    const infoFile = path.join(bankDir, 'info.toml')
    const bank: VoiceBank = { name: entry.name, dir: bankDir }
    if (existsSync(infoFile)) {
      try {
        const info = parseToml(readFileSync(infoFile, 'utf8'))
        const speaker = info.speaker as TomlObject | undefined
        bank.version = info.version as string | undefined
        bank.type = info.type as string | undefined
        bank.topKey = info.top_key as string | undefined
        bank.bottomKey = info.bottom_key as string | undefined
        bank.speaker = (speaker?.name as string | undefined) || entry.name
        bank.gender = speaker?.gender as string | undefined
        bank.language = speaker?.language as string | undefined
        bank.support = !!speaker?.support
      } catch { /* 部分 info 解析失败也保留基础条目 */ }
    }
    banks.push(bank)
  }
  return banks
}

// ---------------------------------------------------------------------------
// 声库安装（zip → model/）
// ---------------------------------------------------------------------------

export class NeutrinoError extends Error {}

export async function installVoicebank(zipPath: string, dir: string | null = null): Promise<{ installed: string[] }> {
  const install = dir || findInstall()
  if (!install) throw new NeutrinoError('NEUTRINO install not found')
  const modelDir = path.join(install, 'model')
  await fs.mkdir(modelDir, { recursive: true })
  const target = path.join(modelDir, '__vb_install_' + Date.now())
  await fs.mkdir(target, { recursive: true })
  const tmp = path.join(target, 'content')
  await fs.mkdir(tmp, { recursive: true })
  await unzip(zipPath, tmp)
  const moved: string[] = []
  for (const entry of await fs.readdir(tmp, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await moveBankDir(path.join(tmp, entry.name), modelDir, moved)
    }
  }
  await fs.rm(target, { recursive: true, force: true })
  return { installed: moved }
}

async function moveBankDir(bankDir: string, modelDir: string, moved: string[]): Promise<boolean> {
  const entries = await fs.readdir(bankDir, { withFileTypes: true })
  const hasInfo = entries.some((e) => e.isFile() && e.name.toLowerCase() === 'info.toml')
  if (hasInfo) {
    const name = path.basename(bankDir)
    const dest = path.join(modelDir, name)
    await fs.rm(dest, { recursive: true, force: true })
    await fs.rename(bankDir, dest)
    moved.push(name)
    return true
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (await moveBankDir(path.join(bankDir, e.name), modelDir, moved)) return true
    }
  }
  return false
}

async function unzip(zipPath: string, dest: string): Promise<void> {
  const r = isWindows()
    ? spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`], { encoding: 'utf8' })
    : spawnSync('unzip', ['-q', zipPath, '-d', dest], { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new NeutrinoError(`Unzip failed: ${r.stderr || r.stdout || 'unknown'}`)
  }
}

// ---------------------------------------------------------------------------
// 目录与输出
// ---------------------------------------------------------------------------

export function scoreDir(dir: string | null = null): string | null {
  const install = dir || findInstall()
  return install ? path.join(install, 'score', 'musicxml') : null
}

export function outputDir(dir: string | null = null): string | null {
  const install = dir || findInstall()
  return install ? path.join(install, 'output') : null
}

export interface OutputFile {
  file: string
  size: number
  mtime: string
}

export async function listOutputs(dir: string | null = null): Promise<OutputFile[]> {
  const out = outputDir(dir)
  if (!out || !existsSync(out)) return []
  const files = (await fs.readdir(out)).filter((f) => f.endsWith('.wav')).map((f) => {
    const s = statSync(path.join(out, f))
    return { file: f, size: s.size, mtime: s.mtime.toISOString() }
  }).sort((a, b) => b.mtime.localeCompare(a.mtime))
  return files
}

export function latestOutput(dir: string | null = null): { name: string; path: string; mtime: Date; size: number } | null {
  const out = outputDir(dir)
  if (!out || !existsSync(out)) return null
  // 按修改时间倒序取最新（不能按文件名排序：字母序 ≠ 时间序）
  const wavs = readdirSync(out).filter((f) => f.endsWith('.wav'))
  if (!wavs.length) return null
  wavs.sort((a, b) => statSync(path.join(out, b)).mtimeMs - statSync(path.join(out, a)).mtimeMs)
  const name = wavs[0]
  const stat = statSync(path.join(out, name))
  return { name, path: path.join(out, name), mtime: stat.mtime, size: stat.size }
}
