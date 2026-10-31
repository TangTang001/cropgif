# GIF Crop 正式工程

当前交付：第一版开发计划阶段 1，生产处理核心与最小集成页。裁剪框及蓝色原型的正式页面属于后续阶段。

```powershell
Set-Location F:\SEO\gifcrop_project\web
npm run dev
npm test
npm run build
npm run preview
```

开发基线：Node 22.22.1、Vite 7.1.7、gifsicle-wasm-browser 1.5.19（现有 1.92 核心）、gifuct-js 2.1.2、gifenc 1.0.3。保留 package-lock.json，重新安装使用 npm ci。

本次 npm ci 因网络断开未完成，随后逐文件核对并复用了实验工程的同版本依赖。证据见 dependency-evidence.json。下载中断目录仅作诊断保留，由 .gitignore 排除，不进入 dist。

处理入口：src/gif/client.js → worker.js → hybrid.js。B 仅在正常生成但动画元数据不符时尝试 A；A 需要量化时拒绝。主线程负责登记与终止处理 Worker 和 B 的子 Worker，保证超时不留下运算任务。配置集中在 src/config.js，当前上限是起始防护参数，容量与手机设备验收仍在后续阶段。

回归脚本 tests/run-regression.mjs 直接使用正式工程的生产 Worker。其宽松正确性配置沿用原实验扫描上限，与默认产品限制的定向测试分开。输出写入 test-resources/crop-benchmark/runs 的新标签目录，不覆盖基线。

```powershell
# label 必须不存在
node tests/run-regression.mjs --label my-stage1
node tests/run-regression.mjs --label my-stage1 --edge
```

Playwright 使用当前 Codex 本机运行库；可通过 PLAYWRIGHT_MODULE 指定其他安装位置。Chrome、Edge 使用已安装浏览器，不要求下载 Playwright 自带 Chromium。独立画面和原始元数据验证继续使用实验工程的 verify-browser.mjs 与 verify.py；正式处理不依赖测试目录。

详情与未测项见 阶段1验收报告.md。许可证及底层 WASM 来源待确认项见 licenses/README.md。
