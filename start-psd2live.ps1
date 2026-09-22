<#
.SYNOPSIS
    启动 PSD2Live 便携版桌面应用（独立进程脱离终端会话）
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$appExe = Join-Path $PSScriptRoot "portable\PSD2Live\PSD2Live.exe"

if (-not (Test-Path $appExe)) {
    Write-Host "错误: 未找到可执行文件: $appExe" -ForegroundColor Red
    exit 1
}

# 检查是否已经在运行
$existing = Get-NetTCPConnection -LocalPort 23871 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "PSD2Live 服务已在运行中 (端口 23871 处于监听状态)。" -ForegroundColor Green
    exit 0
}

Write-Host "正在唤起 PSD2Live 桌面端..." -ForegroundColor Cyan
# 通过 explorer.exe 脱离父终端的 Job Object 独立运行
Start-Process explorer.exe "`"$appExe`""

Write-Host "等待服务端口 (127.0.0.1:23871) 启动..." -NoNewline
$connected = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $conn = Get-NetTCPConnection -LocalPort 23871 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $connected = $true
        break
    }
    Write-Host "." -NoNewline
}

Write-Host ""
if ($connected) {
    Write-Host "PSD2Live 服务已就绪！MCP 端点监听在 http://127.0.0.1:23871/mcp" -ForegroundColor Green
} else {
    Write-Host "PSD2Live 已唤起，若首次加载时间稍长，请稍后运行 .\check-mcp.ps1 查看状态。" -ForegroundColor Yellow
}
