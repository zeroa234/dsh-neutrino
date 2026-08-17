/**
 * score.ts — 从「音高+时值+歌词」生成 NEUTRINO 兼容 MusicXML 乐谱。
 * 纯逻辑模块：无 IO、无依赖，便于测试。来源：neutrino-mcp 的 musicxml.js。
 *
 * 音符格式（SMN — Simple Note Notation）：
 *   "C4:4:こ"      → C4 四分音符，唱「こ」
 *   "F#3:8:ん"     → F#3 八分音符
 *   "R:4"          → 四分休止（分隔乐句）
 *   "C4:4"         → 无歌词（连音/拖腔，自动与前/后同音高音符连线）
 *   "C4:t1112:こ"  → 精确时值（tick，divisions-per-beat 基准）
 *   时值：1/2/4/8/16/32，支持附点如 "4."。
 *   歌词：全角平假名/片假名按实际发音书写；' = 母音脱落，ー = 长音，っ = 促音。
 */

export interface ParsedNote {
  type: 'note' | 'rest' | 'breath'
  step?: string
  alter?: number
  octave?: number
  duration: number // 全音符单位（1 = 全音符）
  divisions: number // tick 数（480/拍）
  lyric: string | null
  tie?: 'start' | 'stop'
}

const STEP_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }

export function parseNote(token: string, divisionsPerBeat = 480): ParsedNote | null {
  token = token.trim()
  if (token === '') return null
  if (token === ',' || token === '|') {
    // 换气记号：NEUTRINO 用它生成 pau 分段（rest 会报 blank lyric，必须带 breath-mark）
    return { type: 'breath', duration: 0.25, divisions: Math.round(0.25 * 4 * divisionsPerBeat), lyric: null }
  }
  const m = token.match(/^([A-GR])([#b]?)(-?\d+)?(?::(t\d+|[1-9][0-9]*(?:\.[0-9]*)?))?(?::(.*))?$/i)
  if (!m) throw new Error(`Invalid note token: "${token}" (expected like C4:4:こ, C4:t1112:こ or R:4)`)
  const [, letter, acc, octaveStr, durStr, lyric] = m
  const L = letter.toUpperCase()
  const exact = durStr != null && durStr.startsWith('t')
  if (L === 'R') {
    const divs = exact ? parseInt(durStr.slice(1), 10) : durToDivisions(parseDuration(durStr || '4'), divisionsPerBeat)
    return { type: 'rest', duration: divs / (4 * divisionsPerBeat), divisions: divs, lyric: null }
  }
  const octave = octaveStr != null ? parseInt(octaveStr, 10) : 4
  const divs = exact ? parseInt(durStr.slice(1), 10) : durToDivisions(parseDuration(durStr || '4'), divisionsPerBeat)
  const alter = acc === '#' ? 1 : acc === 'b' ? -1 : 0
  return {
    type: 'note',
    step: L,
    alter,
    octave,
    duration: divs / (4 * divisionsPerBeat),
    divisions: divs,
    lyric: lyric != null && lyric !== '' ? lyric : null,
  }
}

function parseDuration(d: string): number {
  // "4" → 四分 (0.25)，"4." → 附点四分，"8" → 八分，"1" → 全音符
  const m = String(d).match(/^(\d+)(\.*)$/)
  if (!m) throw new Error(`Bad duration "${d}"`)
  let v = 1 / parseInt(m[1], 10)
  for (let i = 0; i < m[2].length; i++) v *= 1.5
  return v
}

function durToDivisions(wholeUnits: number, dpb: number): number {
  return Math.round(wholeUnits * 4 * dpb)
}

function divsToType(divs: number, dpb: number): string {
  const beats = divs / dpb
  const table: Record<string, string> = { '4': 'whole', '2': 'half', '1': 'quarter', '0.5': 'eighth', '0.25': '16th', '0.125': '32nd', '0.0625': '64th' }
  for (const [b, t] of Object.entries(table)) {
    if (Math.abs(Number(b) - beats) < 1e-6) return t
  }
  for (const [b, t] of Object.entries(table)) {
    if (Math.abs(Number(b) * 1.5 - beats) < 1e-6) return t
    if (Math.abs(Number(b) * 1.75 - beats) < 1e-6) return t
  }
  let best = 'quarter'
  let bestDiff = Infinity
  for (const [b, t] of Object.entries(table)) {
    const d = Math.abs(Number(b) - beats)
    if (d < bestDiff) { bestDiff = d; best = t }
  }
  return best
}

function dotsFor(divs: number, dpb: number): number {
  const beats = divs / dpb
  for (const b of [4, 2, 1, 0.5, 0.25, 0.125]) {
    if (Math.abs(b - beats) < 1e-6) return 0
    if (Math.abs(b * 1.5 - beats) < 1e-6) return 1
    if (Math.abs(b * 1.75 - beats) < 1e-6) return 2
  }
  return 0
}

function xmlEscape(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface BuildScoreOptions {
  title?: string
  notes: Array<string | ParsedNote>
  bpm?: number
  beatsPerMeasure?: number
  divisionsPerBeat?: number
  voiceName?: string
}

/**
 * 生成 MusicXML 文档字符串。
 * 注意：musicXMLtoLabel 会截断跨小节线音符，因此长音符在小节边界拆分
 * （后半段无歌词 → 自动 tie 延音）。
 */
export function buildMusicXML({ title = 'Untitled', notes = [], bpm = 120, beatsPerMeasure = 4, divisionsPerBeat = 480, voiceName = 'NEUTRINO' }: BuildScoreOptions): string {
  const parsed = notes.map((n) => (typeof n === 'string' ? parseNote(n, divisionsPerBeat) : n))
  const divisions = divisionsPerBeat

  const parts: string[] = []
  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')
  parts.push('<score-partwise version="3.1">')
  parts.push(`  <work><work-title>${xmlEscape(title)}</work-title></work>`)
  parts.push(`  <identification><creator type="composer">NEUTRINO DSH</creator></identification>`)
  parts.push(`  <part-list><score-part id="P1"><part-name>${xmlEscape(voiceName)}</part-name></score-part></part-list>`)
  parts.push(`  <part id="P1">`)

  // 按小节线拆分长音符（CRITICAL：跨小节会被 musicXMLtoLabel 截断）
  const barTicks = beatsPerMeasure * divisions
  const splitNotes: ParsedNote[] = []
  let sp = 0
  for (const n of parsed) {
    if (!n) continue
    if (n.type === 'rest' || n.type === 'breath') { splitNotes.push(n); sp += n.divisions; continue }
    let remaining = n.divisions
    let segIdx = 0
    while (remaining > 0) {
      const barEnd = (Math.floor(sp / barTicks) + 1) * barTicks
      const room = barEnd - sp
      const take = Math.min(room, remaining)
      const isFirst = segIdx === 0
      const isLast = take >= remaining
      // 碎片（<60 ticks）并入前一段，避免 musicXMLtoLabel 产生异常
      if (!isFirst && take < 60 && splitNotes.length > 0) {
        const prevN = splitNotes[splitNotes.length - 1]
        prevN.divisions += take
        prevN.duration = prevN.divisions / (4 * divisions)
        sp += take
        remaining -= take
        segIdx++
        continue
      }
      const tie = !isLast ? 'start' : (!isFirst ? 'stop' : undefined)
      splitNotes.push({
        ...n,
        divisions: take,
        duration: take / (4 * divisions),
        lyric: isFirst ? n.lyric : null, // 后段无歌词 → tie 延音
        tie,
      })
      sp += take
      remaining -= take
      segIdx++
    }
  }
  const parsed2 = splitNotes

  const measures: ParsedNote[][] = []
  let current: ParsedNote[] = []
  let pos = 0
  for (const n of parsed2) {
    if (!n) continue
    current.push(n)
    pos += n.divisions
    if (pos >= beatsPerMeasure * divisions && current.length) {
      measures.push(current)
      current = []
      pos = 0
    }
  }
  if (current.length) measures.push(current)

  // 连音解析：无歌词音符 + 后续同音高 = melisma 延音（tie start → stop）
  for (let i = 0; i < parsed2.length; i++) {
    const n = parsed2[i]
    if (!n || n.type === 'rest' || n.type === 'breath') continue
    const prev = i > 0 ? parsed2[i - 1] : null
    const samePitch = prev && prev.type === 'note' && prev.step === n.step && prev.alter === n.alter && prev.octave === n.octave
    if (samePitch && prev.lyric == null && !prev.tie && !n.tie) {
      prev.tie = 'start'
      n.tie = 'stop'
    }
  }

  measures.forEach((notesInMeasure, mi) => {
    parts.push(`    <measure number="${mi + 1}" implicit="no">`)
    if (mi === 0) {
      // 完整 attributes + 速度标记只放第一小节（空小节会让 NEUTRINO 生成多余 pau）
      parts.push(`      <attributes>`)
      parts.push(`        <divisions>${divisions}</divisions>`)
      parts.push(`        <key><fifths>0</fifths><mode>major</mode></key>`)
      parts.push(`        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>`)
      parts.push(`        <clef><sign>G</sign><line>2</line></clef>`)
      parts.push(`      </attributes>`)
      parts.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`)
    } else {
      parts.push(`      <attributes><divisions>${divisions}</divisions></attributes>`)
    }
    let tick = 0
    for (const n of notesInMeasure) {
      tick += n.divisions
      const isRest = n.type === 'rest'
      const isBreath = n.type === 'breath'
      const type = divsToType(n.divisions, divisions)
      const dots = dotsFor(n.divisions, divisions)
      const tiedStart = !isRest && !isBreath && n.tie === 'start'
      const tiedStop = !isRest && !isBreath && n.tie === 'stop'

      parts.push(`      <note>`)
      if (isRest || isBreath) {
        parts.push(`        <rest/>`)
      } else {
        parts.push(`        <pitch>`)
        parts.push(`          <step>${n.step}</step>`)
        if (n.alter) parts.push(`          <alter>${n.alter}</alter>`)
        parts.push(`          <octave>${n.octave}</octave>`)
        parts.push(`        </pitch>`)
        if (tiedStart) parts.push(`        <tie type="start"/>`)
        else if (tiedStop) parts.push(`        <tie type="stop"/>`)
      }
      parts.push(`        <duration>${n.divisions}</duration>`)
      parts.push(`        <type>${type}</type>`)
      for (let i = 0; i < dots; i++) parts.push(`        <dot/>`)
      if (isBreath) {
        parts.push(`        <notations><articulations><breath-mark/></articulations></notations>`)
      }
      if (!isRest && !isBreath && n.lyric != null) {
        parts.push(`        <lyric number="1"><syllabic>single</syllabic><text>${xmlEscape(n.lyric)}</text></lyric>`)
      }
      parts.push(`      </note>`)
    }
    parts.push(`    </measure>`)
  })

  parts.push(`  </part>`)
  parts.push(`</score-partwise>`)
  return parts.join('\n')
}

/**
 * 解析紧凑乐谱文本：每行由 SMN token 组成，空白分隔；'#' 开头为注释行。
 */
export function parseScore(text: string): string[] {
  const tokens: string[] = []
  for (const line of String(text).split('\n')) {
    const lineTrim = line.trim()
    if (!lineTrim || lineTrim.startsWith('#')) continue
    for (const tok of lineTrim.split(/\s+/)) {
      if (tok === '|') continue // 换气标记：休止符已自动分段
      tokens.push(tok)
    }
  }
  return tokens
}
