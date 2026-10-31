# 真实站点 UI 对照

采集日期：2026-10-30。此目录仅用于选择视觉参考，原有 design-v1 未修改。

启动：在项目根目录运行 `node ui-references/serve.mjs`，访问 http://127.0.0.1:4187/ 。支持截图放大、浅色/深色分类和分别选择布局与配色；复制结果由用户自行发回聊天，不自动发送消息。

| 编号 | 来源 | 本次状态 |
|---|---|---|
| A | https://www.iloveimg.com/crop-image | 原站上传入口 |
| B | https://www.resizepixel.com/edit/ | 裁剪参数区，示例图未完整加载 |
| C | https://squoosh.app/ | 内置 Artwork 示例后的实际编辑状态 |
| D | https://www.photopea.com/ | 编辑器启动页，未成功新建文档 |
| E | https://ezgif.com/crop | 原站上传入口 |

Photopea 完整工作区的官方说明：https://www.photopea.com/learn/workspace 。

补充 BeFunky 官方教程：https://www.befunky.com/learn/meme-generator/ 。其教程截图可以参考侧边裁剪参数与深灰工作区，但实际编辑器本次加载超时，未冒充实时界面截图。

sources.json 保存采集到的页面信息与失败记录。Pixlr、Img2Go 等加载失败；Polarr 停留启动画面。没有将空白或启动 Logo 截图作为编辑界面参考。

未上传用户文件、未登录账号。Squoosh 使用其站点内置示例；其余不导入图片。原站截图完整保留，颜色小样及适用性评价是本项目的观察，不是原站官方设计规范。来源图片与品牌归原站，供本地内部设计讨论，不进入产品发布包。
