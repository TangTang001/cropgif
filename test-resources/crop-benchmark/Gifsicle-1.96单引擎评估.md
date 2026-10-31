# Gifsicle 1.96 单引擎路线评估

日期：2026-10-30。

## 结论

**不替换现有 H 双引擎方案。** 当前 1.96 核心仍有真实透明错误、帧合并和画布尺寸变化；按原有标准单独使用会减少可交付选区。正式技术方案、开发计划及原型处理路线未改。

## 实际测试版本

- 用户指定的 npm gifsicle-wasm@1.96.3 已实际下载并核对包哈希：只有 README.md 和 package.json，缺少声明的 dist/gifsicle.js 与 dist/gifsicle.wasm，无法执行。原包保留在 tools/gifsicle-wasm196。
- 上游 1.96.4 提交说明为修复空包；保存的版本差异只涉及 CI 路径、文档与版本号，未改变核心子模块或构建算法。实际测试使用完整的 npm 1.96.4，运行时 --version 返回 LCDF Gifsicle 1.96。不能将本轮标作 npm 1.96.3 实测。
- 没有自行编译 WASM。适配只给上游 UMD 文件追加 ES module export，并封装 argv、虚拟文件系统、退出码及 stderr。WASM 原样使用，哈希见汇总 JSON。每次裁剪新建实例，无 A 兜底。
- 对比参数为 --crop X,Y+WxH /input.gif -o /output.gif --logical-screen WxH，没有减色、压缩或改变时间参数。为暴露原始错误，测试保存 CLI 返回成功的输出；这是评估入口，不是通过生产安全验收的交付路径。

## 完整回归

| 项目 | Chrome | Edge |
|---|---:|---:|
| 浏览器版本 | 155.0.8059.39 | 156.0.4314.50 |
| 输入 / 裁剪记录 | 45 / 159 | 45 / 159 |
| 正常与边界选区 | 151 | 151 |
| 浏览器画面、尺寸及播放总时长检查通过 | 141 | 141 |
| 画面及原始动画元数据全部通过 | 115 | 115 |
| 未满足完整标准的正常/边界选区 | 36 | 36 |
| 原始帧数 / 逐帧延迟变化 | 35 / 35 | 35 / 35 |
| 原始画布尺寸不符 | 1 | 1 |
| 明确异常输入拒绝 | 7 | 7 |
| no_trailer 容错接受 | 1 | 1 |
| 原 H 路线严格可交付 | 148 | 148 |

各项问题可能重叠，不能相加。浏览器画面检查按播放时间线比较；帧数与延迟序列由独立 GIF 块扫描核对，两项都必须通过。小帧大画布的 1×1 输出原始画布变为 7×7，原生解码画面对比未抓到这一点，说明不能省略原始元数据检查。

相对原 H 路线，1.96 单引擎少通过 33 个选区，新通过 0 个。两个浏览器的 152 个原始输出逐字节一致，45 个输入哈希保持不变。

## 之前的问题是否解决

| 问题 | 本轮结果 |
|---|---|
| dispose_background / dispose_previous 的 1×1 裁剪 | 未解决：两帧仍合成一帧，后半段应透明的画面变为不透明 |
| 511 色多调色板原始样本，全图 | 正确；原 B 路线已经能处理，不是新解决的问题 |
| 三个 hybrid-511colors-disposal1/2/3 的 palette-union 选区 | 仍改变帧数及逐帧延迟；disposal2/3 还出现浏览器透明差异，均不能交付 |
| hybrid-255colors/511colors 的 disposal2/3 | center 与 palette-union 出现真实透明差异，A 兜底仍有实际作用 |
| 损坏 LZW | 两个样本均以非零退出和明确诊断拒绝，之后同一 Worker 可处理正常输入 |
| small_frame_big_canvas 的 1×1 裁剪 | 输出原始画布为 7×7，不符合请求的 1×1 |

## 工程与边界

- Chrome/Edge 实际 GIF 下载、日志下载、旧下载失效、损坏文件后恢复及 390px 无横向溢出检查通过。UI 自动化同时运行 A 和候选 W196；不是正式产品交互验收。8 个异常类别输入（含 no_trailer）之后同一 Worker 均可继续正常处理。
- Vite 构建与容器元数据定向检查通过；构建首次被沙箱 realpath 权限阻止，在沙箱外重试通过。没有完整验证生产静态托管、手机真机、Safari/Firefox 或浏览器总内存峰值。
- Pillow 检查分别为正常 93 PASS / 42 DIFF、边界 16 PASS。Pillow 背景解释差异不能算成浏览器错误，最终结论使用浏览器画面加独立原始元数据。
- 没有遍历其他 CLI 参数、重编译 1.98 或放宽“不改变帧数/逐帧延迟”的要求。本轮否定的是所测包及参数直接替换 H 的方案，不是证明所有单引擎方案都不可行。
- 诊断接口更直接、来源更容易追踪是该包的工程优点，但不能抵消当前输出正确性问题。

## 复现与证据

在 crop-benchmark 目录执行，新的 label 不得覆盖已有结果：

```powershell
node scripts/run-browser.mjs --label wasm196-new --suite suite-hybrid.json --engines W196
python scripts/verify.py runs/wasm196-new-chrome
node scripts/verify-browser.mjs runs/wasm196-new-chrome
node scripts/run-browser.mjs --label wasm196-new --suite suite-hybrid.json --engines W196 --edge
python scripts/verify.py runs/wasm196-new-edge
node scripts/verify-browser.mjs runs/wasm196-new-edge --edge
```

- runs/wasm196-final-chrome 与 runs/wasm196-final-edge：159 条原始日志、输出文件、独立元数据/Pillow检查、浏览器画面对比和 UI 证据。
- runs/wasm196-evaluation-summary.json：全部失败明细、与 H 的对照、跨浏览器检查、依赖与适配文件哈希。
- tools/gifsicle-wasm196：原 1.96.3 包、1.96.4 独立安装及锁文件、npm 元数据、上游版本差异。
- runs/wasm196-probe-chrome 为模块加载失败探针；probe2 为定向探针，不混入最终统计。

## 浏览器画面差异

| 样本 | 选区 | alpha 差异像素计数 | RGB 差异像素计数 |
|---|---|---:|---:|
| testdata/dispose_background.gif | pixel | 1 | 0 |
| testdata/dispose_previous.gif | pixel | 1 | 0 |
| generated/hybrid-255colors-disposal2.gif | center | 128 | 0 |
| generated/hybrid-255colors-disposal2.gif | palette-union | 256 | 0 |
| generated/hybrid-255colors-disposal3.gif | center | 128 | 0 |
| generated/hybrid-255colors-disposal3.gif | palette-union | 256 | 0 |
| generated/hybrid-511colors-disposal2.gif | center | 128 | 0 |
| generated/hybrid-511colors-disposal2.gif | palette-union | 256 | 0 |
| generated/hybrid-511colors-disposal3.gif | center | 128 | 0 |
| generated/hybrid-511colors-disposal3.gif | palette-union | 256 | 0 |
