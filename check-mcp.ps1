<#
.SYNOPSIS
    检查当前仓库的 PSD2Live MCP 连接，不启动应用或修改配置。
#>
[CmdletBinding()]
param([ValidateRange(1, 60)][int]$TimeoutSeconds = 10)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$toolsPython = Join-Path $PSScriptRoot 'python\Scripts\python.exe'
$diagnostic = Join-Path $PSScriptRoot 'scripts\check_mcp.py'
if (-not (Test-Path -LiteralPath $toolsPython -PathType Leaf)) {
    Write-Host "[FAIL] 未找到项目 Python: $toolsPython" -ForegroundColor Red
    exit 2
}
if (-not (Test-Path -LiteralPath $diagnostic -PathType Leaf)) {
    Write-Host "[FAIL] 未找到诊断脚本: $diagnostic" -ForegroundColor Red
    exit 2
}
& $toolsPython $diagnostic --timeout $TimeoutSeconds
exit $LASTEXITCODE
