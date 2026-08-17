# dsh-neutrino · 让 AI 合成日语歌声（STUDIO NEUTRINO）

**Make your AI assistant sing: lyrics + melody → a character's WAV, powered by STUDIO NEUTRINO.**

DeepSeek Harness (dsh) 插件：你告诉 AI **用哪个角色、唱什么歌词、什么旋律**，它自动生成乐谱、调用歌声引擎渲染，最后给你一个 WAV 音频文件。
A DeepSeek Harness (dsh) plugin: tell the AI **which character, what lyrics, what melody**, and it writes the score, drives the singing engine, and hands you a WAV file.

**STUDIO NEUTRINO 是什么？** 一个**免费**的日语 AI 歌声合成引擎（类似 Vocaloid 的免费替代品），由 [STUDIO NEUTRINO](https://studio-neutrino.com/) 开发，内置多位免费角色声库（ずんだもん / 東北きりたん 等），发音自然、支持情感强度调节。本插件是它的"遥控器"——负责把"歌词+旋律"变成引擎能读懂的乐谱，并管理渲染全过程。
**What is STUDIO NEUTRINO?** A **free** Japanese AI singing-voice synthesis engine (a free Vocaloid alternative) by [STUDIO NEUTRINO](https://studio-neutrino.com/), with built-in free character voicebanks (Zundamon / Tohoku Kiritan …), natural pronunciation, and emotion control. This plugin is its "remote control" — it turns lyrics + melody into a score the engine understands and manages the whole render pipeline.

> 如果你只是听说过"唱歌软件"但没装过引擎——没关系，插件没装引擎也能用（乐谱工具正常），只有真正要"出声"时才需要引擎，且插件会给出官方下载引导。
> If you've only heard of "singing software" and never installed an engine — no problem: the plugin works without it (score tools fine), the engine is only needed to actually produce audio, and the plugin points you to the official downloads.

---

## 前置要求 · Prerequisites（先看这个 · Read this first）

| 需要的东西 What you need | 必须吗 Required | 说明 Notes |
|---|---|---|
| **DeepSeek Harness (dsh)** | ✅ 必须 Required | 插件运行环境 The plugin runtime |
| **NEUTRINO 引擎本体 Engine** | 合成歌声时 ⚠️ 必需 Needed to synthesize | **免费**，[官方下载](https://studio-neutrino.com/downloads/)；只写谱可跳过 **Free**, official download; skip if score-only |
| **角色声库 Voicebank** | 合成歌声时 ⚠️ 必需 Needed to synthesize | **免费**，官方 zip（如ずんだもん），用插件导入 **Free**, official zip (e.g. Zundamon), imported via the plugin |
| **操作系统 OS** | — | 引擎支持 **Windows / macOS**（Linux 需额外折腾）Engine supports Windows/macOS (Linux needs extra work) |
| **Node.js + npm** | 源码安装时 Source install | 克隆仓库才需要；仓库已提交编译产物，多数情况可跳过 Only needed when building from source; the repo ships built `lib/` |
| **NVIDIA GPU** | 可选 Optional | 加速推理；没有则自动用 CPU（慢一些）Speeds up inference; falls back to CPU automatically |
| **磁盘空间 Disk** | 建议 Recommended | 引擎 + 声库约 1~3 GB Engine + voicebank ≈ 1–3 GB |

> 💡 引擎和声库的官方下载文件在 Google Drive 上，国内网络可能需要代理。
> Official engine/voicebank downloads live on Google Drive; users in mainland China may need a proxy.

---

## 我能拿它做什么 · Quick demo

在对话里直接说（中文即可）· Just tell the assistant in natural language:

> "用ずんだもん，唱《一闪一闪亮晶晶》的日语版，BPM 100"

AI 生成音符谱（如 `C4:4:き らきらひかる`）→ 调用 `_dsh_external_dsh_neutrino_synthesize_song` → 给你 WAV 文件路径。生成的 WAV 还能配合 [dsh-midi-studio](https://github.com/zeroa234/dsh-midi-studio) 混入伴奏，做成完整歌曲。
The AI writes a note score → calls `_dsh_external_dsh_neutrino_synthesize_song` → returns a WAV path. The WAV can then be mixed with a backing track via [dsh-midi-studio](https://github.com/zeroa234/dsh-midi-studio) for a full song.

---

## 特性 · Features

> 工具注册名统一为 `_dsh_external_dsh_neutrino_*` 全名（harness 不做名字缩短，模型按注册名调用）。
> Tool registration names are the full `_dsh_external_dsh_neutrino_*` (the harness does not shorten names; the model calls the registered names).

| 工具 Tool（注册名 Registration name） | 作用 / 没装引擎时 What it does / without an engine |
|---|---|
| `_dsh_external_dsh_neutrino_status` | 一键体检：引擎版本、声库、最近输出 One-shot health check: engine, voicebanks, recent outputs / ✅ 官方下载引导 download guidance |
| `_dsh_external_dsh_neutrino_list_voicebanks` | 已装声库列表（名称/音域）Installed voicebanks (name/range) / ✅ 下载引导 |
| `_dsh_external_dsh_neutrino_install_voicebank` | 从官方 zip 导入声库（自动识别目录）Import a voicebank from an official zip (auto-detects layout) / ✅ 下载引导 |
| `_dsh_external_dsh_neutrino_create_score` | 歌词+旋律 → 乐谱 MusicXML Lyrics + melody → MusicXML score / ✅ 照常用 works |
| `_dsh_external_dsh_neutrino_render_score` | 乐谱 → WAV（styleShift/移调/GPU）Score → WAV (styleShift/transpose/GPU) / ❌ 下载引导 |
| `_dsh_external_dsh_neutrino_synthesize_song` | **一站式**：写谱+渲染直接出 WAV One-shot: score + render → WAV / ❌ 下载引导 |
| `_dsh_external_dsh_neutrino_list_outputs` | 最近渲染的 WAV 列表 Recent rendered WAVs / ✅ 空列表 empty |

## 使用流程 · Typical workflow

```
status（看就绪状态 health check）→ synthesize_song（一站式合成 one-shot）→ list_outputs（拿结果 get results）

你 You:  帮我看一下 NEUTRINO 装好了没  →  status（引擎 ✓ 声库：ずんだもん ✓）
你 You:  用ずんだもん唱「きらきらひかる おそらのほしよ」，BPM 100  →  synthesize_song → WAV 路径
你 You:  把上次的 WAV 路径给我  →  list_outputs
```

## 音符格式（SMN）· Note format (SMN)

每个音符一个 token（`音高:时值:歌词`）· One token per note (`pitch:duration:lyrics`)：

```
C4:4:こ        ← C4 四分音符，唱「こ」· C4 quarter note singing “こ”
F#3:8:ん       ← F#3 八分音符 · F#3 eighth note
R:4            ← 四分休止（分隔乐句）· quarter rest (phrase separator)
C4:2           ← 二分音符，无歌词（连音/拖腔，自动连线）· half note, no lyrics (tie/sustain)
```

- **音高 Pitch**：`C4` 记法（C~B + #/b + 八度），须在声库音域内 `C4` notation (C–B + #/b + octave), inside the voicebank's range
- **时值 Duration**：`1` 全音符 ~ `32` 三十二分；支持附点 `4.`、精确 tick `C4:t1112:こ` whole note `1` to 32nd `32`; dotted `4.`, exact tick `C4:t1112:こ`
- **歌词 Lyrics**：全角假名按实际发音写（「こんにちは」→ `こんにちわ`）；`'` 母音脱落、`ー` 长音、`っ` 促音 kana as actually pronounced; `'` vowel devoicing, `ー` long vowel, `っ` geminate

示例（AI 实际生成的格式）· Example (as generated by the AI)：

```json
{
  "title": "hello",
  "notes": ["C4:4:こ", "D4:8:ん", "E4:8:に", "F4:4:ち", "G4:4:わ", "R:8", "G4:8:ず", "F4:8:ん", "E4:8:だ", "D4:8:も", "C4:4:ん", "R:8", "C4:8:で", "D4:8:す"],
  "bpm": 100,
  "model": "ZUNDAMON"
}
```

---

## 引擎参数（进阶）· Engine parameters (advanced)

| 参数 Parameter | 默认 Default | 说明 Description |
|---|---|---|
| `model` | 自动 auto | 用哪个声库（`model/` 下文件夹名）Which voicebank (folder under `model/`) |
| `supportModel` | 关 off | 混入第二声库音色（需 `support=true`）Blend a second voicebank (needs `support=true`) |
| `styleShift` | 2 | **情感强度 Emotion** -55..+55（更激动/更平静 more intense/calmer） |
| `transpose` | 0 | 整体移调（半音）Global transpose (semitones) |
| `numThreads` | 自动 auto | CPU 线程数 CPU threads |
| `samplingRate` | 48000 | 采样率 Hz Sample rate |
| `bitDepth` | 16 | 8/16/24/32/float |
| `useGPU` | true | NVIDIA GPU 加速（无 GPU 自动回落 CPU）GPU acceleration (falls back to CPU) |
| `phrase` | 关 off | 只渲染第 N 个乐句（1 起，调错音时省时间）Render only phrase N (starts at 1) |
| `skipTiming` | 关 off | 跳时序预测，用已有 timing .lab（手动精调）Skip timing, reuse an existing timing .lab |

## 配置 · Configuration

| 配置项 Option | 默认 Default | 说明 Description |
|---|---|---|
| `neutrinoDir` | 自动探测 auto-detect | NEUTRINO 安装目录 Installation directory |
| `defaultModel` | 自动选第一个声库 first voicebank | 默认声库 Default voicebank |
| `scoreDir` | `~/.dsh-neutrino/scores` | 无引擎时乐谱暂存目录 Staging dir when engine is absent |

## 安装 · Installation

### 第 1 步：安装插件 · Install the plugin

仓库即标准 dsh bundle 包（`@dsh-external/dsh-neutrino`），克隆后直接安装（已提交编译产物，无需本地构建）：

The repo is a standard dsh bundle package (`@dsh-external/dsh-neutrino`) — clone and install (built `lib/` is committed; no local build needed):

```powershell
git clone https://github.com/zeroa234/dsh-neutrino
cd dsh-neutrino
npm install
dsh plugin --profile web add .
```

重启 harness 后，新会话工具列表出现 `_dsh_external_dsh_neutrino_*` 七个工具。
After a harness restart, the seven `_dsh_external_dsh_neutrino_*` tools appear in new sessions.

### 第 2 步：获取 NEUTRINO 引擎（免费，合成歌声才需要）· Get the engine (free, needed to sing)

1. 打开[官方下载页](https://studio-neutrino.com/downloads/)下载引擎 zip（如 `NEUTRINO-Win-v1.x.zip`）Download the engine zip from the [official downloads](https://studio-neutrino.com/downloads/).
2. 解压到任意目录，比如 `D:\NEUTRINO` Unzip anywhere, e.g. `D:\NEUTRINO`.
3. 告诉插件引擎在哪（二选一）Tell the plugin where it is (either way):

   - 环境变量 Env var：`NEUTRINO_DIR=D:\NEUTRINO`
   - 插件配置（profile 的 `cordis.patch.yml`）· Plugin config:

```yaml
- id: dsh-neutrino
  name: '@dsh-external/dsh-neutrino'
  config:
    neutrinoDir: 'D:\NEUTRINO'
```

> 不设置也行：插件会自动探测常见位置。装好后跑 `_dsh_external_dsh_neutrino_status` 看绿色就绪即成功。
> Or skip it: the plugin auto-detects common locations. After installing, run `_dsh_external_dsh_neutrino_status` — green = ready.

### 第 3 步：导入角色声库（免费）· Import a voicebank (free)

1. 从[官方下载页](https://studio-neutrino.com/downloads/)获取声库 zip（如「ずんだもん（NEUTRINO-Library）」）Get a voicebank zip from the [official downloads](https://studio-neutrino.com/downloads/).
2. 让 AI 用 `_dsh_external_dsh_neutrino_install_voicebank` 导入，或手动解压到 `<NEUTRINO>/model/` Import via `_dsh_external_dsh_neutrino_install_voicebank`, or unzip into `<NEUTRINO>/model/`.
3. `_dsh_external_dsh_neutrino_list_voicebanks` 确认就绪 Confirm with `list_voicebanks`.

---

## 常见问题 · FAQ

**Q: 没装引擎/声库，工具会报错吗？** 不会——status/list/install 类工具返回**官方下载引导**（链接已实测有效）；只有真去渲染才要求引擎就绪。
**Q: Do tools break without an engine/voicebank?** No — status/list/install tools return **official download guidance** (links verified); only actual rendering requires the engine.

**Q: 渲染很慢？** 没有 NVIDIA GPU 时走 CPU 会慢几倍；可调低 `numThreads` 或分句用 `phrase` 渲染。
**Q: Rendering slow?** Without an NVIDIA GPU it falls back to CPU; lower `numThreads` or render per-phrase with `phrase`.

**Q: 唱出来的情感不对？** 调 `styleShift`（-55 平静 ~ +55 激烈），或检查歌词是否按实际发音书写（「は」作助词读「わ」）。
**Q: Emotion wrong?** Adjust `styleShift` (-55 calm ~ +55 intense), or check lyrics are written as actually pronounced (particle は → わ).

**Q: 声库能商用/二次分发吗？** 各声库有独立利用規約，见 `model/<声库>/Readme（お読みください）.pdf`。
**Q: Can voicebanks be used commercially / redistributed?** Each voicebank has its own usage terms — see `model/<voicebank>/Readme（お読みください）.pdf`.

---

## 测试 · Tests

```bash
npm test   # node:test（零依赖），28 用例覆盖 SMN 解析 / MusicXML / 声库 / 渲染管线 · node:test (zero deps), 28 cases: SMN parsing / MusicXML / voicebanks / render pipeline
```

## 开发 · Development

```bash
npm run build      # 编译 src → lib（需 DSH_CHECKOUT 或 ~/dsh-harness）Compile src → lib (needs DSH_CHECKOUT or ~/dsh-harness)
npm test           # node:test 28 用例 · node:test, 28 cases
npm run typecheck  # tsc --noEmit
```

## 仓库结构 · Repository layout

```
dsh-neutrino/
├── src/               # TypeScript 源码 · TypeScript source
│   ├── index.ts       # 工具注册 · Tool registration
│   └── lib/           # engine / render / score / toml
├── lib/               # 编译产物（仓库内提交，克隆即用）· Built output (committed, clone-and-use)
├── tests/             # node:test 用例（28 个）· node:test suites (28)
├── scripts/
│   └── build.sh       # 构建脚本（DSH_CHECKOUT 自动探测）· Build script (auto-probes DSH_CHECKOUT)
├── package.json
├── README.md
└── LICENSE
```

## 许可证 · License

本项目 BSD-3-Clause。NEUTRINO 引擎与声库版权归 STUDIO NEUTRINO / 各角色项目所有，请遵守各声库随附的利用規約。
This project is BSD-3-Clause. The NEUTRINO engine and voicebanks belong to STUDIO NEUTRINO / each character project — please follow the usage terms shipped with each voicebank.