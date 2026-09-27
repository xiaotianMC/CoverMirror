param([string]$PhotoshopPath = 'E:\Adobe\Adobe Photoshop 2021\Photoshop.exe')

$ErrorActionPreference = 'Stop'
if (Get-Process Photoshop -ErrorAction SilentlyContinue) {
    throw '请先关闭 Photoshop；此测试会启动并关闭自己的实例。'
}

$started = Start-Process -FilePath $PhotoshopPath -WindowStyle Hidden -PassThru
$psApp = $null
$snapshot = $null
try {
    Start-Sleep -Seconds 12
    $psApp = New-Object -ComObject Photoshop.Application
    $hostScript = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\plugin-cep\host.jsx')
    $smokeScript = "`nvar smokeDoc = app.documents.add(640, 360, 72, 'Bili Cover Smoke'); var smokeResult; try { smokeResult = biliCoverSnapshot(); } finally { smokeDoc.close(SaveOptions.DONOTSAVECHANGES); } smokeResult;"
    $snapshot = $psApp.DoJavaScript($hostScript + $smokeScript)
    if (-not (Test-Path -LiteralPath $snapshot)) { throw "缩略图未生成：$snapshot" }
    $bytes = (Get-Item -LiteralPath $snapshot).Length
    if ($bytes -lt 100) { throw "缩略图文件过小：$bytes bytes" }
    Write-Output "Photoshop 2021 缩略图验证通过：$bytes bytes"
} finally {
    if ($snapshot -and (Test-Path -LiteralPath $snapshot)) { Remove-Item -LiteralPath $snapshot -Force }
    if ($psApp) { try { $psApp.Quit() } catch {} }
    if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force }
}
