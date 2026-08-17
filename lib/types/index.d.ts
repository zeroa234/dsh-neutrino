import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "@dsh-external/dsh-neutrino";
export declare const inject: string[];
export interface Config {
    /** NEUTRINO 安装目录（缺省自动探测：NEUTRINO_DIR 环境变量 → 各盘符根目录） */
    neutrinoDir?: string;
    /** 默认声库名（缺省自动选第一个已安装声库） */
    defaultModel?: string;
    /** 无引擎时乐谱暂存目录 */
    scoreDir: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    neutrinoDir: z<string, string>;
    defaultModel: z<string, string>;
    scoreDir: z<string, string>;
}>, Schemastery.ObjectT<{
    neutrinoDir: z<string, string>;
    defaultModel: z<string, string>;
    scoreDir: z<string, string>;
}>>;
export declare function apply(ctx: Context, config: Config): void;
