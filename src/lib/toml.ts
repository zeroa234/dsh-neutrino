/**
 * toml.ts — 极简 TOML 解析器（子集：表、key = value、字符串、整数、布尔）。
 * 足够解析 NEUTRINO 声库的 info.toml / config.toml。纯函数，无依赖。
 */

export type TomlValue = string | number | boolean | TomlObject
export interface TomlObject { [key: string]: TomlValue | TomlObject | undefined }

export function parse(input: string): TomlObject {
  const root: TomlObject = {}
  let table: TomlObject = root
  const lines = String(input).split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      // 新表头一律从根表开始寻址（否则第二个表会错误嵌套进第一个表）
      table = root
      const name = line.slice(1, -1).trim()
      for (const key of name.split('.')) {
        const existing = table[key]
        if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
          const next: TomlObject = {}
          table[key] = next
          table = next
        } else {
          table = existing as TomlObject
        }
      }
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // 去掉行尾注释
    const hash = value.indexOf('#')
    if (hash >= 0) value = value.slice(0, hash).trim()
    if (!key) continue
    if (/^"[^"]*"$/.test(value) || /^'[^']*'$/.test(value)) {
      table[key] = value.slice(1, -1)
    } else if (/^-?\d+$/.test(value)) {
      table[key] = parseInt(value, 10)
    } else if (/^-?\d+\.\d+$/.test(value)) {
      table[key] = parseFloat(value)
    } else if (value === 'true' || value === 'false') {
      table[key] = value === 'true'
    } else {
      table[key] = value
    }
  }
  return root
}
