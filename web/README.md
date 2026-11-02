# GIF Crop 正式工程

当前交付：第一版开发计划阶段 1、2。正式页面沿用蓝色原型，首次进入选择本地 GIF；默认全图自由选区，支持移动、八个边角手柄、宽高输入、正方形及键盘操作。

```powershell
Set-Location F:\SEO\gifcrop_project\web
npm run dev
npm test
npm run build
npm run preview
```

手机人工验收：手机和电脑连接同一 Wi-Fi，在电脑执行 `npm run dev -- --host 0.0.0.0 --port 5173 --strictPort`，手机访问终端 Network 中对应 Wi-Fi 的地址（例如 `http://192.168.1.199:5173/`）。不要在手机使用 localhost/127.0.0.1。测试期间保持电脑和服务运行；无法连接时核对网络，并允许 Node.js 通过 Windows 防火墙的专用网络。

载入时按 GIF 文件头和容器内容校验；其他格式即使改成 .gif 也会被拒绝，弹窗提供重新选择入口，选文件区域保留错误提示。只有成功载入的文件才显示其文件名；真实 GIF 的 MIME 为空或后缀不同不影响内容校验。

裁剪数据始终使用原图整数像素。方向键移动 1px，Shift + 方向键移动 10px；焦点位于手柄时调整对应边。正方形开关取当前选区内居中的正方形，切回自由比例保留当前框；Reset 恢复全图自由比例。修改宽高时保留可编辑的非法草稿，Crop 禁用；Escape 撤销草稿。扩大尺寸导致越界时，选区向图内移动。

只点击 Crop 才编码。修改选区或输入时立即撤销旧结果和下载 URL。页面缩放、滚动和窗口尺寸变化使用当前显示边界换算坐标，不把 CSS 尺寸发送给处理核心。

开发基线：Node 22.22.1、Vite 7.1.7、gifsicle-wasm-browser 1.5.19（现有 1.92 核心）、gifuct-js 2.1.2、gifenc 1.0.3。保留 package-lock.json，重新安装使用 npm ci。

本次 npm ci 因网络断开未完成，随后逐文件核对并复用了实验工程的同版本依赖。证据见 dependency-evidence.json。下载中断目录仅作诊断保留，由 .gitignore 排除，不进入 dist。

处理入口：src/gif/client.js → worker.js → hybrid.js。B 仅在正常生成但动画元数据不符时尝试 A；A 需要量化时拒绝。主线程负责登记与终止处理 Worker 和 B 的子 Worker，保证超时不留下运算任务。配置集中在 src/config.js，当前上限是起始防护参数，容量与手机设备验收仍在后续阶段。

回归脚本 tests/run-regression.mjs 直接使用正式工程的生产 Worker。其宽松正确性配置沿用原实验扫描上限，与默认产品限制的定向测试分开。输出写入 test-resources/crop-benchmark/runs 的新标签目录，不覆盖基线。

```powershell
# label 必须不存在
node tests/run-regression.mjs --label my-stage1
node tests/run-regression.mjs --label my-stage1 --edge

# 先 npm run build；同一 label 的输出目录必须不存在
node tests/run-interaction.mjs --label=my-stage2
node tests/run-interaction.mjs --label=my-stage2 --edge
node tests/run-safety.mjs --label=my-stage2-safety
```

Playwright 使用当前 Codex 本机运行库；可通过 PLAYWRIGHT_MODULE 指定其他安装位置。Chrome、Edge 使用已安装浏览器，不要求下载 Playwright 自带 Chromium。独立画面和原始元数据验证继续使用实验工程的 verify-browser.mjs 与 verify.py；正式处理不依赖测试目录。

阶段 2 交互测试使用生产构建的静态预览，包含实际下载、逐帧画面及原始动画元数据验证。大体积下载及截图在本机 runs 中保留，Git 只保留阶段验收摘要和检查记录；重建这些输出需重新运行测试。

详情与未测项见 阶段1验收报告.md、阶段2验收报告.md。完整错误流程、容量和真机验收按后续阶段继续；许可证及底层 WASM 来源待确认项见 licenses/README.md。
