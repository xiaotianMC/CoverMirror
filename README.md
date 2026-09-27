# CoverMirror（封面镜）

CoverMirror 是一个多平台封面预览工具。当前版本提供 B 站视频卡片预览，由 Photoshop 面板和独立桌面应用共用界面。`E:\Adobe\Adobe Photoshop 2021` 是版本 22.0，因此项目提供适配它的 CEP 面板；另保留面向新版 Photoshop 的 UXP 面板。PS 2021 CEP 面板可读取与修改活动文档的文字图层；桌面应用保留本地图片导入，也可通过本机配对接收 PS 预览并提交文字修改。

## 运行

需要 Node.js 20+。桌面应用：

```powershell
npm install
npm start
```

Photoshop 插件：

```powershell
npm run build:plugin
```

Photoshop 2021 使用 `dist/cep` 扩展目录。它通过 CEP/ExtendScript 从活动文档直接导出预览 JPEG，并在面板内缩图，详细加载方式见 [plugin-cep/README.md](plugin-cep/README.md)。本机 Photoshop 22.0 已通过旧截图路径及临时文档文字编辑测试；新版导出路径和闪烁消除仍需在 PS 面板中核对。

桌面应用启动后显示本次启动的配对码，将其填入 Photoshop CEP 面板的“桌面应用配对码”并点击连接。桌面“预览来源”可在本地图片和 Photoshop 之间切换；本地导入会保持本地预览，不会被后台 PS 帧覆盖。桥接仅监听本机地址，断线时文字命令不会自动重发。

新版 Photoshop 可在 UXP Developer Tool 中添加 `dist/plugin/manifest.json` 并加载面板。UXP 面板要求 Photoshop 24.4 或更新版本，图片读取使用 Adobe 的 [Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging/)。

检查项目结构：`npm run check`。完整产品路线见 [PROJECT_PLAN.md](PROJECT_PLAN.md)。
