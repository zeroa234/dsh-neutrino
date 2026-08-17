/** 渲染参数（与 neutrino.exe CLI 一一对应；undefined 表示不传） */
export interface RenderParams {
    modelDir?: string | null;
    supportModelDir?: string | null;
    styleShift?: number;
    transpose?: number;
    numThreads?: number;
    bitDepth?: string | number;
    samplingRate?: number;
    useGPU?: boolean;
    gpuId?: number;
    skipTiming?: boolean;
    skipF0?: boolean;
    skipMelspec?: boolean;
    skipWav?: boolean;
    phrase?: number;
    phraseList?: string;
}
export declare const DEFAULT_PARAMS: RenderParams;
/**
 * 从工具入参构建渲染参数（参数名映射 + 默认声库兜底）。
 * 工具 schema 用 `model` / `supportModel`（用户友好命名），
 * 内部 CLI 用 `modelDir` / `supportModelDir`——这里完成映射，
 * 避免出现"用户指定了声库却被静默忽略"的死参数。
 */
export declare function buildRenderParams(args: Record<string, unknown>, defaultModel?: string | null): RenderParams;
export interface RenderResult {
    code: number;
    stdout: string;
    stderr: string;
    step: 'musicXMLtoLabel' | 'neutrino';
    modelDir: string;
    wav: string | null;
    ok: boolean;
    error?: string;
}
export interface RenderOptions {
    basename: string;
    params?: RenderParams;
    dir?: string | null;
    onProgress?: (chunk: string) => void;
}
/**
 * 渲染一个已存在的乐谱（basename 无扩展名，须在 score/musicxml/ 下）。
 * 步骤：musicXMLtoLabel → NEUTRINO(label→f0/melspec) → vocoder(→wav)。
 */
export declare function render({ basename, params, dir, onProgress }: RenderOptions): Promise<RenderResult>;
