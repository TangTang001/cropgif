# GIF 裁剪引擎验证

此目录是独立实验，不是产品页面。只读取同级 `codec-corpus/` 的 GIF，不修改其内容；自生成样本写入本目录 `generated/`，输出写入 `runs/`。

## 运行

使用 Node.js 22.12+，Python 3（Pillow、NumPy），以及本机 Chrome 或 Edge。

```powershell
cd F:\SEO\gifcrop_project\test-resources\crop-benchmark
npm ci --legacy-peer-deps
python scripts/prepare.py
node scripts/test-meta.mjs
npm run dev
```

打开终端给出的本地地址。选择预置样本或本地文件，输入整数选区，分别运行 A/B，预览并下载。此页不包含拖动裁剪框；它验证引擎而非完整产品交互。

开发服务器只监听 127.0.0.1。测试文件由只读中间件提供，`npm run build` 检查打包，不包含样本 API；本实验以开发服务器运行。

## 自动测试

自动脚本自行启动 4175 端口的临时服务器并在结束后关闭。不要同时运行两份自动脚本。浏览器依赖默认使用本机 Codex 捆绑 Playwright，其他环境通过 `PLAYWRIGHT_MODULE` 指定 playwright/index.mjs 的绝对路径。

```powershell
node scripts/run-browser.mjs
node scripts/run-browser.mjs --edge
python scripts/verify.py runs/<运行目录>
```

可设置 `RUN_LABEL` 标记一次实验；设置 `ONLY_SAMPLE` 为文件名片段可定向复测。Python 未在 PATH 时，使用本机 Python 的完整路径。

建议用命令行参数固定目录和样本，避免环境变量没有在当前终端生效。以下三条必须依次成功执行：

```powershell
node scripts/run-browser.mjs --label disposal-repro --sample dispose_background --engines A,B,B-strict,B-U-strict
node scripts/cross-check.mjs runs/disposal-repro-chrome
python scripts/analyze-cross.py runs/disposal-repro-chrome
```

第一步生成 `runs.json` 和 GIF，第二步生成 `chrome-reference/index.json`，第三步才生成对比报告。若运行目录已有 `runs.json`，脚本会拒绝覆盖；复测请给 `--label` 换一个新名称，并在后两条命令使用对应目录。两个 Node 脚本和分析脚本均按项目目录解释相对结果路径。

设置 `ENGINE_VARIANTS` 为 `A,B,B-strict` 可复现完整 Chrome 配置矩阵；`B-U-strict` 是单独的先还原帧探针。页面中的 B 配置下拉框也能选择这三种 B 配置。严格模式默认用于实验时保守拒绝警告，不表示它已经适合正式产品。

```powershell
$env:ENGINE_VARIANTS = 'A,B,B-strict'
node scripts/run-browser.mjs
node scripts/cross-check.mjs runs/<运行目录>
python scripts/analyze-cross.py runs/<运行目录>
```

本轮结果和选型限制见 [测试报告.md](测试报告.md)。`final-chrome` 和 `final-edge` 为最终完整矩阵；`ui-final-chrome` 为最终 UI/JSON 下载复测。

## 两个候选

- A：gifuct-js 解码原始索引像素，自己处理帧合成/处置和裁剪，gifenc 输出。读取原始延迟，避免 gifuct-js 将零延迟替换成默认值。单帧不超过 256 种 RGBA 颜色时保留精确颜色，否则使用 gifenc 量化并记录帧数。透明与普通同色像素独立建索引。未覆盖画布/清除区域采用本次 Chrome 交叉检查的透明策略，不能因此宣称与所有解码器的逻辑背景策略相同。
- B：gifsicle-wasm-browser 基础 `--crop x,y+widthxheight input.gif -o /out/result.gif`，不手工加减色、压缩、unoptimize 或时间选项。库内部会创建 Worker，外层 Worker 负责隔离任务和错误；实际版本及完整命令记录在日志。
- B-strict：同一命令，封装 `isStrict=true`，任何 stderr 警告即拒绝。B-U-strict：另加 `--unoptimize`。这些配置分别记日志，不混合通过统计。封装的 DOM 类型检测已适配为 Worker 可用方式，核心算法未改。
- 两者共用有界容器校验与选区校验。共同校验拒绝文件不等于解码器本身拒绝；测试报告需保留这一区分。LZW 压缩流的语义错误仍可能进入引擎。

## 产物

- `suite.json`：样本路径、哈希、尺寸、帧数及分组。
- `generated/`：自有、确定性生成的两个性能样本和一个多调色板正确性样本，允许本项目免费使用。
- `runs/<运行目录>/environment.json`：设备、浏览器、包版本与未测项。
- `runs.json`：每个选区/方案的参数、耗时、输出元数据、错误及恢复结果。
- `*.gif`：实际浏览器 Worker 生成的文件；UI 下载文件另外保存。
- `verification.json` / `verification.md`：Pillow 逐帧像素和独立 GIF 块扫描的结果。
- `diffs/`：每项首个像素差异帧的预期、实际、差异图。
- `page.png` / `narrow-layout.png` / `ui-checks.json`：UI 冒烟检查。
- `chrome-reference/`：选定小样本的 Chrome ImageDecoder 原生 RGBA、对齐检查和原生差异 PNG，用于排除 Pillow 背景解释不同造成的误判。

性能测量分为外层 Worker 初始化、处理往返及部分内部耗时；不含文件选择和本地样本网络读取。full 是新 Worker 的第一个任务；center 的三次后续执行取中位数。B 的内层 WASM 可能每次重新初始化，因此不能把“后续执行”误解为已复用 WASM。短任务的计时误差较大，dev server 下的时间不直接等于生产环境时间。

未测：手机真机、Safari、Firefox、总内存峰值、所有动画的完整肉眼播放。窄屏截图只是布局检查；Chrome 和 Edge 都属于 Chromium。

## 参考与许可

- 上游 CC0 测试资源及来源见 `../codec-corpus/README.md`、`download-manifest.json`。
- 用户新增的真实文件仅用于本地测试，其来源许可尚未逐一核实，不纳入公开发布包。
- 基础库仓库：https://github.com/matt-way/gifuct-js 、https://github.com/mattdesl/gifenc 、https://github.com/renzhezhilu/gifsicle-wasm-browser 。
- Gifsicle 封装的 MIT 标记不能替代底层 Gifsicle 的许可核查。正式产品采用或分发前应检查实际打包代码及源码提供要求；本实验不对商业分发给出许可结论。

严格通过要求：尺寸、帧数、每帧时长、循环字段和可见像素/透明均一致。视觉等价但合并帧的结果单列，不自动放宽“不丢帧”的首版要求。边界语义有争议时交叉检查，不将单个参考解码器视为绝对标准。

逐帧结果帧数不同时，verify.py 使用正时长的时间边界对齐像素；帧数和时长序列仍独立验收。零时长不会由脚本自行推断成浏览器播放速度。Pillow PASS 统计必须连同原生参考及总报告阅读。

## 2026-10-30 补测

1.98 原生全量回归及双引擎可行性见 [原生回归与组合方案评估](原生回归与组合方案评估.md)。新增 `scripts/verify-browser.mjs runs/<目录> [--edge]`，对全部有效输出在浏览器里按时间线比较尺寸、alpha 和可见 RGB；原始帧数、延迟及循环字段仍由 verify.py 独立检查。

工具链下载已按用户要求暂停。W198 适配和构建脚本尚未执行验证，页面选项已禁用，没有可用的 1.98 WASM 构建产物。现有 A/B 路径仍可用于测试。

## 双引擎验证结论

已实现实验方案 H（B 主处理、A 有条件兜底），可在测试页配置下拉框选择“自动 B → A（验证）”。Chrome、Edge 各跑 45 个输入、159 条记录，实际交付的 148 个有效输出全部通过逐帧检查；3 个复杂合法选区因无法保留帧结构或颜色被拒绝。方案适合作为有明确支持边界的第一版处理策略，不能宣称支持任意 GIF 或通用修复。详见 [双引擎验证最终结论](双引擎验证最终结论.md)。

扩展清单为 suite-hybrid.json，保留原 suite.json。运行示例：`node scripts/run-browser.mjs --label hybrid-new --suite suite-hybrid.json --engines H`。H 使用固定版本 B 的诊断适配区分真实错误和已知警告，升级依赖需重新验证；不会在数据损坏后继续换引擎尝试成功。
