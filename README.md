# dsh-neutrino · 让 AI 帮你合成日语歌声

**DeepSeek Harness (dsh) 插件**：一句话，这个插件让 **AI 助手帮你"唱歌"** —— 你告诉它用哪个角色、唱什么歌词、什么旋律，它自动生成乐谱、调用歌声引擎渲染，最后给你一个 **WAV 音频文件**。

**STUDIO NEUTRINO 是什么？** 一个**免费**的日语 AI 歌声合成引擎（类似 Vocaloid 的免费替代品），由 [STUDIO NEUTRINO](https://studio-neutrino.com/) 开发。它内置多位免费角色声库（如ずんだもん/東北きりたん等），发音自然，还支持情感强度调节。本插件只是它的"遥控器"——负责把"歌词+旋律"变成引擎能读懂的乐谱，并管理渲染全过程。

> 如果你只是听说过"唱歌软件"但没装过引擎——没关系，插件没装引擎也能用（乐谱工具正常），只有真正要"出声"时才需要引擎，而且插件会给你官方下载引导。

---

## 我能拿它做什么？· Quick demo

在对话里直接说（中文即可）：

> "用ずんだもん，唱《一闪一闪亮晶晶》的日语版，BPM 100"

AI 会生成音符谱（如 `C4:4:き らきらひかる`），调用 `_dsh_external_dsh_neutrino_synthesize_song`，几分钟后给你 WAV 文件路径。生成的 WAV 还能配合 [dsh-midi-studio](https://github.com/zeroa234/dsh-midi-studio) 混入伴奏，做完整歌曲。

---

## 前置要求 · Prerequisites（重要，先看这个）

| 需要的东西 | 必须吗 | 说明 |
|---|---|---|
| **DeepSeek Harness (dsh)** | ✅ 必须 | 插件运行环境（Web GUI / CLI 均可） |
| **NEUTRINO 引擎本体** | 合成歌声时 ⚠️ 必需 | **免费**，[官方下载](https://studio-neutrino.com/downloads/)；只写谱不用引擎也能装 |
| **角色声库（音源）** | 合成歌声时 ⚠️ 必需 | **免费**，官方 zip（如ずんだもん），用插件导入 |
| **操作系统** | — | 引擎支持 **Windows / macOS**（Linux 需额外折腾） |
| **Node.js + npm** | 源码安装时 ✅ | 克隆仓库安装才需要；用于编译（本仓库已提交编译产物，多数情况可跳过） |
| **NVIDIA GPU** | 可选 | 加速推理；没有就自动用 CPU，只是慢一点 |
| **磁盘空间** | 建议 | 引擎 + 声库约 1~3 GB |

> 💡 引擎和声库的下载文件都在 Google Drive 上（官方提供），国内网络可能需要代理。

---

## 安装 · Installation

### 第 1 步：安装插件

```sh
dsh plugin --profile web add github:zeroa234/dsh-neutrino
```

或本地克隆：

```sh
git clone https://github.com/zeroa234/dsh-neutrino
cd dsh-neutrino
npm install
dsh plugin --profile web add .
```

重启 harness 后，新会话工具列表出现 `_dsh_external_dsh_neutrino_*` 七个工具。

### 第 2 步：获取 NEUTRINO 引擎（免费，合成歌声才需要）

1. 打开[官方下载页](https://studio-neutrino.com/downloads/)下载 Windows/macOS 版引擎 zip（如 `NEUTRINO-Win-v1.x.zip`）
2. 解压到任意目录，比如 `D:\NEUTRINO`
3. 告诉插件引擎在哪（二选一）：
   - 环境变量：`NEUTRINO_DIR=D:\NEUTRINO`
   - 插件配置（profile 的 `cordis.patch.yml`）：

```yaml
- id: dsh-neutrino
  name: '@dsh-external/dsh-neutrino'
  config:
    neutrinoDir: 'D:\NEUTRINO'
```

> 不设置也行：插件会自动探测常见位置。装好后跑 `_dsh_external_dsh_neutrino_status`，看到绿色就绪即成功。

### 第 3 步：导入角色声库（免费）

1. 从[官方下载页](https://studio-neutrino.com/downloads/)获取角色声库 zip（如「ずんだもん（NEUTRINO-Library）」）
2. 对话里让 AI 用 `_dsh_external_dsh_neutrino_install_voicebank` 导入，或手动解压到 `<NEUTRINO>/model/` 目录
3. `_dsh_external_dsh_neutrino_list_voicebanks` 确认声库就绪

---

## 怎么用 · How to use

推荐流程：**status（看就绪状态）→ synthesize_song（一站式合成）→ list_outputs（拿结果）**

```text
你：帮我看一下 NEUTRINO 装好了没
AI：→ _dsh_external_dsh_neutrino_status（引擎 ✓ 声库：ずんだもん ✓）

你：用ずんだもん唱「きらきらひかる おそらのほしよ」，C大调，BPM 100
AI：→ _dsh_external_dsh_neutrino_synthesize_song → WAV 路径

你：把上次的 WAV 路径给我
AI：→ _dsh_external_dsh_neutrino_list_outputs
```

### 七个工具 · Tools

| 工具 | 作用 | 没装引擎时 |
|---|---|---|
| `_dsh_external_dsh_neutrino_status` | 一键体检：引擎版本、声库、最近输出 | ✅ 返回官方下载引导 |
| `_dsh_external_dsh_neutrino_list_voicebanks` | 查看已装声库（名称/音域） | ✅ 返回下载引导 |
| `_dsh_external_dsh_neutrino_install_voicebank` | 从官方 zip 导入声库（自动识别目录） | ✅ 返回下载引导 |
| `_dsh_external_dsh_neutrino_create_score` | 歌词+旋律 → 乐谱（MusicXML） | ✅ 照常用 |
| `_dsh_external_dsh_neutrino_render_score` | 乐谱 → WAV（含 styleShift/移调/GPU） | ❌ 返回下载引导 |
| `_dsh_external_dsh_neutrino_synthesize_song` | **一站式**：写谱+渲染直接出 WAV | ❌ 返回下载引导 |
| `_dsh_external_dsh_neutrino_list_outputs` | 列出最近渲染的 WAV | ✅ 返回空列表 |

### 音符格式（SMN）· How to write notes

每个音符一个 token：`音高:时值:歌词`

```
C4:4:こ        ← C4 四分音符，唱「こ」
F#3:8:ん       ← F#3 八分音符
R:4            ← 四分休止（分隔乐句）
C4:2           ← 二分音符，无歌词（连音/拖腔，自动连线）
```

- **音高**：`C4` 记法（C~B + #/b + 八度），需在声库音域内
- **时值**：`1` 全音符 ~ `32` 三十二分；支持附点 `4.`、精确 tick `C4:t1112:こ`
- **歌词**：全角假名按发音写（「こんにちは」→ `こんにちわ`）；`'` 母音脱落、`ー` 长音、`っ` 促音

示例（AI 实际生成的格式）：

```json
{
  "title": "hello",
  "notes": ["C4:4:こ", "D4:8:ん", "E4:8:に", "F4:4:ち", "G4:4:わ", "R:8", "G4:8:ず", "F4:8:ん", "E4:8:だ", "D4:8:も", "C4:4:ん", "R:8", "C4:8:で", "D4:8:す"],
  "bpm": 100,
  "model": "ZUNDAMON"
}
```

---

## 引擎参数（进阶）· Engine parameters

| 参数 | 默认 | 说明 |
|---|---|---|
| `model` | 自动 | 用哪个声库（`model/` 下文件夹名） |
| `supportModel` | 关 | 混入第二声库音色（需该声库 `support=true`） |
| `styleShift` | 2 | **情感强度** -55..+55（调大更激动/悲伤） |
| `transpose` | 0 | 整体移调（半音） |
| `numThreads` | 自动 | CPU 线程数 |
| `samplingRate` | 48000 | 采样率 Hz |
| `bitDepth` | 16 | 8/16/24/32/float |
| `useGPU` | true | NVIDIA GPU 加速（无 GPU 自动回落 CPU） |
| `phrase` | 关 | 只渲染第 N 个乐句（1 起，调错音时省时间） |
| `skipTiming` | 关 | 跳时序预测，用已有 timing .lab（手动精调） |

## 配置 · Configuration

| 配置项 | 默认 | 说明 |
|---|---|---|
| `neutrinoDir` | 自动探测 | NEUTRINO 安装目录 |
| `defaultModel` | 自动选第一个声库 | 默认声库名 |
| `scoreDir` | `~/.dsh-neutrino/scores` | 无引擎时乐谱暂存目录 |

## 常见问题 · FAQ

**Q: 没装引擎/声库，工具报错？** 不会——status/list/install 类工具会返回**官方下载引导**（链接已实测有效）。只有真去渲染才会要求引擎就绪。

**Q: 渲染很慢？** 没 NVIDIA GPU 时走 CPU 会慢几倍；可调低 `numThreads` 或分段用 `phrase` 渲染。

**Q: 唱出来的情感不对？** 调 `styleShift`（-55 平静 ~ +55 激烈），或检查歌词是否按实际发音书写（「は」作助词读「わ」等）。

**Q: 声库能商用/二次分发吗？** 各声库有独立利用規約，见 `model/<声库>/Readme（お読みください）.pdf`，请尊重作者规定。

## 开发 · Development

```bash
npm run build    # 编译 src → lib（需 DSH_CHECKOUT 或 ~/dsh-harness）
npm test         # node:test，28 用例：SMN 解析 / MusicXML / 声库 / 输出
npm run typecheck
```

## License

本项目 BSD-3-Clause。NEUTRINO 引擎与声库版权归 STUDIO NEUTRINO / 各角色项目所有，请遵守各声库随附的利用規約。