# Photoshop 2021 面板

Photoshop 2021（22.0）使用 CEP 面板。运行 `npm run build:plugin` 后，将 `dist/cep` 整个目录复制到用户的 CEP `extensions` 目录，并命名为 `com.bilicover.preview.cep`。Windows 通常为 `%APPDATA%\Adobe\CEP\extensions\com.bilicover.preview.cep`。重启 Photoshop 后，在“窗口 → 扩展功能（旧版）”中打开“CoverMirror”。

开发中的未签名 CEP 扩展通常需要启用 `PlayerDebugMode`，正式分发需签名打包。本项目当前仅生成开发目录，不修改系统 CEP 设置或 Photoshop 安装目录。

面板每 1.5 秒从活动文档直接导出临时 JPEG，再在 CEP 中用画布缩到长边不超过 480px，读入后删除临时文件；原文档不会保存，也不会复制、关闭或切换活动文档。导出方式使用 Adobe 官方 [CEP 导出示例](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Exporting%20files%20from%20the%20host%20app/com.cep.export/host/index.jsx)中的 `Document.exportDocument`。若当前文档格式不能直接导出，面板会显示错误。此前的真实 Photoshop 缩略图测试使用旧的临时副本路径；新版直接导出及闪烁消除仍需在面板中观察确认。

“PSD 文字图层”区域读取当前活动文档的文字图层。选择图层、修改内容后点击“应用到 Photoshop”；提交时会核对文档 ID、图层 ID、锁定状态和读取时的内容。若 Photoshop 中先修改了该图层，面板会保留未提交输入并要求重新读取。视频标题、UP 主和时长仅属于卡片预览，不写入 PSD。

桌面应用启动后复制窗口中显示的配对码，填入面板“桌面应用配对码”并点击连接。配对码仅保存在当前运行进程中；重启桌面应用需重新配对。CEP 面板主动连接桌面的 `127.0.0.1` HTTP 服务并上报当前文档缩略图及文字图层，领取一次性文字命令后仍由 Photoshop 宿主检查目标与基线。连接中断或命令结果无法确认时不会自动重做；重新连接会读取最新文档状态。面板和桌面窗口只显示预览，缩略图不会写回 PSD。

`npm run check` 覆盖参数编码、目标与内容冲突、面板输入保留、本机 HTTP 鉴权、断线不重放、模拟 CEP 到宿主的文字闭环，以及桌面等待新帧时的输入保留。`tools/smoke-ps-2021-text.ps1` 在 Photoshop 中新建并关闭两个临时测试文档，不保存 PSD；已有 Photoshop 实例时使用 `-UseRunningPhotoshop`，测试会恢复原活动文档且不会退出应用。本机 Photoshop 22.0 先前通过单行文字读取、写入、一次撤销、原生回传、内容冲突、文档切换和锁定拒绝测试。多行文字换行的真实宿主补充测试未返回结果；现在统一用 LF 对比与传输、向 Photoshop 写入时转换为 CR，模拟 CR 回读检查通过。真实 CEP 面板显示、桌面与面板的联合交互，以及 Electron 应用运行时仍待验证。

关闭 Photoshop 后，可用 `powershell -File tools/smoke-ps-2021.ps1` 重跑缩略图测试；脚本会自行启动和关闭 Photoshop。
