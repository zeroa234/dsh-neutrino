export declare const OFFICIAL_URLS: {
    readonly site: 'https://studio-neutrino.com/';
    readonly downloads: 'https://studio-neutrino.com/downloads/';
    readonly drive: 'https://drive.google.com/drive/folders/1cDicMle0z0y6zRLbQp3dD2kI-Zn21YHC';
};
/** 引擎缺失时给用户的引导文案（status / render 报错共用） */
export declare const ENGINE_GUIDE: string;
export declare function isWindows(): boolean;
export interface InstallInfo {
    installed: boolean;
    dir: string | null;
    version?: string;
    error?: string;
}
/**
 * 定位 NEUTRINO 安装目录。
 * 优先级：显式 dir 参数 → 环境变量 NEUTRINO_DIR → 各盘符根目录浅扫描。
 * 不做任何硬编码绝对路径（公开发布要求）。
 */
export declare function findInstall(dir?: string | null, force?: boolean): string | null;
export declare function markerExists(dir: string): boolean;
export declare function installInfo(dir?: string | null): InstallInfo;
export interface VoiceBank {
    name: string;
    dir: string;
    version?: string;
    type?: string;
    topKey?: string;
    bottomKey?: string;
    speaker?: string;
    gender?: string;
    language?: string;
    support?: boolean;
}
export declare function listVoicebanks(dir?: string | null): VoiceBank[];
export declare class NeutrinoError extends Error {
}
export declare function installVoicebank(zipPath: string, dir?: string | null): Promise<{
    installed: string[];
}>;
export declare function scoreDir(dir?: string | null): string | null;
export declare function outputDir(dir?: string | null): string | null;
export interface OutputFile {
    file: string;
    size: number;
    mtime: string;
}
export declare function listOutputs(dir?: string | null): Promise<OutputFile[]>;
export declare function latestOutput(dir?: string | null): {
    name: string;
    path: string;
    mtime: Date;
    size: number;
} | null;
