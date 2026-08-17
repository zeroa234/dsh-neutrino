/**
 * toml.ts — 极简 TOML 解析器（子集：表、key = value、字符串、整数、布尔）。
 * 足够解析 NEUTRINO 声库的 info.toml / config.toml。纯函数，无依赖。
 */
export type TomlValue = string | number | boolean | TomlObject;
export interface TomlObject {
    [key: string]: TomlValue | TomlObject | undefined;
}
export declare function parse(input: string): TomlObject;
