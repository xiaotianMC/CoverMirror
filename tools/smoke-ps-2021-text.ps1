param(
    [string]$PhotoshopPath = 'E:\Adobe\Adobe Photoshop 2021\Photoshop.exe',
    [switch]$UseRunningPhotoshop
)

$ErrorActionPreference = 'Stop'
if ((Get-Process Photoshop -ErrorAction SilentlyContinue) -and -not $UseRunningPhotoshop) {
    throw '请先关闭 Photoshop；此测试仅在独立实例中新建临时文档。'
}

$started = $null
if (-not $UseRunningPhotoshop) {
    $started = Start-Process -FilePath $PhotoshopPath -WindowStyle Hidden -PassThru
}
$psApp = $null
try {
    if ($started) { Start-Sleep -Seconds 12 }
    $psApp = New-Object -ComObject Photoshop.Application
    $hostScript = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\plugin-cep\host.jsx')
    $testScript = @'
var testDoc = null;
var otherDoc = null;
var testResult;
var originalDoc = app.documents.length ? app.activeDocument : null;
var oldDialogs = app.displayDialogs;
var oldUnits = app.preferences.rulerUnits;
function parseResult(value) { return eval('(' + value + ')'); }
try {
    testDoc = app.documents.add(UnitValue(640, 'px'), UnitValue(360, 'px'), 72, 'Bili Cover Text Smoke');
    var textLayer = testDoc.artLayers.add();
    textLayer.kind = LayerKind.TEXT;
    textLayer.textItem.contents = '原文';
    var state = parseResult(biliCoverTextState());
    if (state.documentId !== testDoc.id || state.layers.length !== 1 || state.layers[0].id !== textLayer.id)
        throw new Error('文字图层读取或 ID 不一致');
    var before = testDoc.historyStates.length;
    var response = parseResult(biliCoverWriteText(testDoc.id, textLayer.id,
        encodeURIComponent('原文'), encodeURIComponent('中文“引号”和\'单引号\'')));
    if (!response.ok || textLayer.textItem.contents !== '中文“引号”和\'单引号\'')
        throw new Error('文字写入失败：' + response.error);
    if (testDoc.historyStates.length !== before + 1)
        throw new Error('一次写入未对应一次历史操作');
    testDoc.activeHistoryState = testDoc.historyStates[before - 1];
    if (textLayer.textItem.contents !== '原文') throw new Error('撤销未恢复原文');
    textLayer.textItem.contents = 'PS 原生编辑';
    state = parseResult(biliCoverTextState());
    if (state.layers[0].content !== 'PS 原生编辑') throw new Error('原生编辑未回传');
    response = parseResult(biliCoverWriteText(testDoc.id, textLayer.id,
        encodeURIComponent('原文'), encodeURIComponent('误写')));
    if (response.error !== 'CONTENT_CHANGED') throw new Error('内容冲突未拒绝');
    otherDoc = app.documents.add(UnitValue(320, 'px'), UnitValue(180, 'px'), 72, 'Bili Cover Switch Smoke');
    response = parseResult(biliCoverWriteText(testDoc.id, textLayer.id,
        encodeURIComponent('PS 原生编辑'), encodeURIComponent('误写')));
    if (response.error !== 'DOCUMENT_CHANGED') throw new Error('文档切换未拒绝');
    app.activeDocument = testDoc;
    textLayer.allLocked = true;
    response = parseResult(biliCoverWriteText(testDoc.id, textLayer.id,
        encodeURIComponent('PS 原生编辑'), encodeURIComponent('误写')));
    if (response.error !== 'LAYER_LOCKED') throw new Error('锁定图层未拒绝');
    textLayer.allLocked = false;
    response = parseResult(biliCoverWriteText(testDoc.id, textLayer.id,
        encodeURIComponent('PS 原生编辑'), encodeURIComponent('第一行\n第二行')));
    if (!response.ok) throw new Error('多行文字写入失败：' + response.error);
    state = parseResult(biliCoverTextState());
    var lineBreak = state.layers[0].content.charCodeAt(3);
    if (lineBreak !== 10 && lineBreak !== 13) throw new Error('多行文字未回传换行：' + lineBreak);
    testResult = 'EOL=' + lineBreak + '；';
    testResult += 'Photoshop 2021 文字图层读取、写入、一次撤销、原生回传及冲突校验通过';
} catch (error) {
    testResult = 'ERROR:' + error.message;
} finally {
    if (otherDoc) otherDoc.close(SaveOptions.DONOTSAVECHANGES);
    if (testDoc) testDoc.close(SaveOptions.DONOTSAVECHANGES);
    if (originalDoc) app.activeDocument = originalDoc;
    app.displayDialogs = oldDialogs;
    app.preferences.rulerUnits = oldUnits;
}
testResult;
'@
    $result = $psApp.DoJavaScript($hostScript + "`n" + $testScript)
    if ($result -like 'ERROR:*') { throw $result }
    Write-Output $result
} finally {
    if ($started -and $psApp) { try { $psApp.Quit() } catch {} }
    if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force }
}
