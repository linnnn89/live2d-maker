param([string]$Method = 'tools/list', [string]$ParamsFile)
$ErrorActionPreference = 'Stop'
$senaCredential = (Get-ItemProperty 'HKCU:/Software/JavaSoft/Prefs/io/github/psd2live/agent').agent_mcp_bearer_token
# Java Preferences escapes uppercase characters as /A on Windows.
$senaCredential = $senaCredential -creplace '/([A-Z])','$1'
$senaHeaders = @{Authorization="Bearer $senaCredential"; Accept='application/json, text/event-stream'}
function Send-SenaRpc($methodName, $parameters) {
    $body = @{jsonrpc='2.0'; id=1; method=$methodName; params=$parameters} | ConvertTo-Json -Depth 70 -Compress
    $response = Invoke-WebRequest 'http://127.0.0.1:23871/mcp' -Method Post -Headers $senaHeaders -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))
    if ($response.Headers['mcp-session-id']) { $senaHeaders['mcp-session-id'] = [string]$response.Headers['mcp-session-id'][0] }
    $data = [string]$response.Content
    if ($data.StartsWith('event:') -or $data.StartsWith('data:')) { $data = (($data -split "`n" | Where-Object { $_.StartsWith('data:') }) -replace '^data: ?','') -join "`n" }
    return $data | ConvertFrom-Json
}
$null = Send-SenaRpc 'initialize' @{protocolVersion='2025-03-26'; capabilities=@{}; clientInfo=@{name='sena-practice';version='1'}}
$senaParams = if ($ParamsFile) { Get-Content -LiteralPath $ParamsFile -Raw | ConvertFrom-Json } else { @{} }
Send-SenaRpc $Method $senaParams | ConvertTo-Json -Depth 70
