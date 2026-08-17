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
    type: 'note' | 'rest' | 'breath';
    step?: string;
    alter?: number;
    octave?: number;
    duration: number;
    divisions: number;
    lyric: string | null;
    tie?: 'start' | 'stop';
}
export declare function parseNote(token: string, divisionsPerBeat?: number): ParsedNote | null;
export interface BuildScoreOptions {
    title?: string;
    notes: Array<string | ParsedNote>;
    bpm?: number;
    beatsPerMeasure?: number;
    divisionsPerBeat?: number;
    voiceName?: string;
}
/**
 * 生成 MusicXML 文档字符串。
 * 注意：musicXMLtoLabel 会截断跨小节线音符，因此长音符在小节边界拆分
 * （后半段无歌词 → 自动 tie 延音）。
 */
export declare function buildMusicXML({ title, notes, bpm, beatsPerMeasure, divisionsPerBeat, voiceName }: BuildScoreOptions): string;
/**
 * 解析紧凑乐谱文本：每行由 SMN token 组成，空白分隔；'#' 开头为注释行。
 */
export declare function parseScore(text: string): string[];
