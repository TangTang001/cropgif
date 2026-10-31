# 桌面 UI 设计稿 v01

日期：2026-10-30。用于审阅页面布局、配色和交互，不是第一版产品已完成开发的声明。

- 当前使用白色背景、浅灰编辑区和深灰文字；主按钮为常规蓝色 #2563EB，悬停 #1D4ED8，选中背景 #EFF6FF。原有湖岸 GIF 作为示例文件保留，未重新着色。
- 英文页面，主编辑区加紧凑参数栏，结果在下方，保留简短步骤与 FAQ。
- 默认载入自有 800×500、16 帧示例；默认选区覆盖全图，可拖动、缩放、输入尺寸、切换正方形。
- 可以选择本地 GIF；Crop 复用既有已验证 H 引擎，结果可实际下载。没有上传文件到服务器。
- 这里优先验证视觉和基本交互，尚未完成正式方案中的全部资源限制、结构化错误码、容量测试、完整产品回归及发布准备。支持范围暂为桌面 Chrome/Edge，窄屏仅作布局检查。

在项目根目录启动：

```powershell
node design-v1/serve.mjs
```

访问 http://127.0.0.1:4186 。使用现有实验工程中的 Vite 和处理库，无需再次安装依赖。服务仅监听本机。

示例的原始绘图为 art/coastal.svg；art/coastal-loop.gif 由 make-demo.mjs 在本地渲染生成，不使用竞品素材或用户私有 GIF。

## 本轮检查

Chrome 155 和 Edge 156 均通过：默认全图、尺寸输入、指针移动/自由缩放/正方形缩放、键盘移动、无效尺寸阻止提交、编辑后清除旧结果、损坏文件后恢复，以及真实 GIF 下载。下载样本为 560×360、16 帧、每帧 100 毫秒、循环字段 0。390px 布局无横向溢出，不代表手机真机验收。

截图及记录：screenshots/desktop-editor.png、screenshots/desktop-result.png、screenshots/checks.json，Edge 记录位于 screenshots/edge/。可用 `node design-v1/check.mjs` 或加 `--edge` 复测；脚本使用当前机器已配置的 Playwright 路径。

## 蓝色版本调整

根据 Gifgit / Pi7 截图讨论确定的工具站方向，改为白底、浅灰工作区、常规蓝色操作按钮和无衬线标题。标题使用“Crop animated GIF”，参数与结果使用直接的功能文案；移除原来的斜体标题、装饰性标语和绿色 UI。Crop、Choose a GIF、Download GIF、裁剪框与选中项保持同一蓝色体系。

蓝色版本截图和检查保存在 screenshots/blue/，Edge 对应 screenshots/blue/edge/，保留先前截图作比较。运行 `node design-v1/check.mjs --blue`，或加 `--edge`，会检查配色、悬停状态及原有裁剪交互。
