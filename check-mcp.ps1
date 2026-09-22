<#
.SYNOPSIS
    PSD2Live MCP 状态与连通性检查脚本
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   PSD2Live MCP 状态检查工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$pythonExe = "D:\live2Dchat\work\tools\python\Scripts\python.exe"
$mcpProxy = "D:\live2Dchat\work\tools\psd2live\mcp_proxy.py"
$appExe = "D:\live2Dchat\work\tools\portable\PSD2Live\PSD2Live.exe"

# 1. 检查 Python 环境
Write-Host "[1/4] 检查 Python 运行环境..." -NoNewline
if (Test-Path $pythonExe) {
    $pyCmd = 'import sys; print(sys.version.split()[0])'
    $pyVer = & $pythonExe -c $pyCmd
    Write-Host " [OK] (Python $pyVer)" -ForegroundColor Green
} else {
    Write-Host " [FAIL] 未找到 $pythonExe" -ForegroundColor Red
}

# 2. 检查注册表 Token
Write-Host "[2/4] 检查 PSD2Live MCP Bearer Token..." -NoNewline
try {
    $tokenRaw = (Get-ItemProperty 'HKCU:\Software\JavaSoft\Prefs\io\github\psd2live\agent' -ErrorAction Stop).agent_mcp_bearer_token
    if ($tokenRaw) {
        $token = $tokenRaw -creplace '/([A-Z])', '$1'
        $maskedLen = [Math]::Min(8, $token.Length)
        $masked = $token.Substring(0, $maskedLen) + "..."
        Write-Host " [OK] (找到 Token: $masked)" -ForegroundColor Green
    } else {
        Write-Host " [WARN] 注册表项存在但 Token 为空，启动 PSD2Live 桌面端后会自动生成" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [WARN] 未在注册表中检测到 Token（启动 PSD2Live 桌面端后会自动生成）" -ForegroundColor Yellow
}

# 3. 检查端口监听
Write-Host "[3/4] 检查 HTTP 服务端口 (127.0.0.1:23871)..." -NoNewline
$portActive = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 23871, $null, $null)
    $portActive = $iar.AsyncWaitHandle.WaitOne(1000, $false)
    if ($portActive) {
        $tcp.EndConnect($iar)
        $tcp.Close()
        Write-Host " [OK] (端口已监听，PSD2Live 服务运行中)" -ForegroundColor Green
    } else {
        $tcp.Close()
        Write-Host " [OFFLINE] (服务未启动)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [OFFLINE] (服务未启动)" -ForegroundColor Yellow
}

# 4. 检查 MCP Stdio 握手
Write-Host "[4/4] 验证 MCP Proxy 初始化握手..." -NoNewline
if ($portActive) {
    try {
        $initJson = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"check-script","version":"1.0"}}}'
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = $pythonExe
        $processInfo.Arguments = "`"$mcpProxy`""
        $processInfo.RedirectStandardInput = $true
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        $processInfo.UseShellExecute = $false
        $processInfo.CreateNoWindow = $true

        $process = [System.Diagnostics.Process]::Start($processInfo)
        $process.StandardInput.WriteLine($initJson)
        $process.StandardInput.Close()

        $output = $process.StandardOutput.ReadLine()
        $process.WaitForExit(3000)

        if ($output -and $output.Contains('"result"')) {
            Write-Host " [OK] (MCP 握手成功！)" -ForegroundColor Green
        } else {
            Write-Host " [WARN] 响应内容: $output" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " [ERROR] $_" -ForegroundColor Red
    }
} else {
    Write-Host " [SKIP] (请先启动 PSD2Live 桌面端再测试完整握手)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "提示: 可运行 .\start-psd2live.ps1 启动桌面端。" -ForegroundColor Cyan
}

Write-Host "========================================" -ForegroundColor Cyan
