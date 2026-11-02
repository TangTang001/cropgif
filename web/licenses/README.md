# 实际依赖的许可与来源清单

日期：2026-10-31。本文件记录工程中的实际材料，不代替底层编译产物来源确认。

2026-11-02 补充：已从实际运行包解码并核对 WASM 的 1.92 版本字符串及 SHA256，详见 [来源核查](来源核查.md)。完整源码/编译映射仍未确认，公开发布仍阻断。`public/licenses/` 中提供现有原始许可文本供网站链接访问，不能据此判定来源核查完成。

| 组件 | 版本 | 当前材料 | 上游 |
|---|---|---|---|
| gifuct-js | 2.1.2 | gifuct-js-LICENSE.txt，来自安装包 | https://github.com/matt-way/gifuct-js |
| gifenc | 1.0.3 | gifenc-LICENSE.txt，来自安装包 | https://github.com/mattdesl/gifenc |
| js-binary-schema-parser | 2.0.3 | js-binary-schema-parser-LICENSE.txt，来自安装包 | https://github.com/matt-way/js-binary-schema-parser |
| gifsicle-wasm-browser 封装 | 1.5.19 | gifsicle-wasm-browser-LICENSE.txt，来自安装包 | https://github.com/renzhezhilu/gifsicle-wasm-browser |
| 嵌入式 Gifsicle 核心 | README 标注 1.92 | gifsicle-COPYING.txt，来自现有 1.92 源码材料 | https://github.com/kohler/gifsicle |

包来源、版本、锁文件 integrity、实际运行文件 SHA256 见 ../dependency-evidence.json。Vite 7.1.7 和对应 esbuild/Rollup 是构建依赖，其文件哈希也已记录。

待发布前完成：封装中的嵌入式 WASM 与准确上游提交、编译脚本及对应源码的完整映射。当前保留的 1.92 COPYING 文本只代表手头源码材料，不能据此声称已证明嵌入式二进制与该源码一致，也不能仅凭封装的 MIT 标记推定底层核心许可已解决。阶段 1 不执行发布。
