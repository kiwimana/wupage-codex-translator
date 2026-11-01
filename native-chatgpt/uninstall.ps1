$ErrorActionPreference = 'Stop'
$registryPath = 'HKCU:\Software\Mozilla\NativeMessagingHosts\org.wupage.codex_bridge'
$expected = Join-Path $PSScriptRoot 'org.wupage.codex_bridge.json'
$existing = Get-Item -LiteralPath $registryPath -ErrorAction SilentlyContinue
if ($existing -and $existing.GetValue('') -eq $expected) {
  Remove-Item -LiteralPath $registryPath
  Write-Output 'Removed the native messaging registration. No ChatGPT credentials or chats were changed.'
} else { Write-Output 'No matching registration found.' }
