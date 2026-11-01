param([Parameter(Mandatory=$true)][ValidateSet('codex','gemini','claude')][string]$Engine, [switch]$Run)
$ErrorActionPreference = 'Stop'
if (-not $Run) {
  $scriptFile = '"' + $PSCommandPath.Replace('"','') + '"'
  Start-Process -FilePath powershell.exe -WindowStyle Normal -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File',$scriptFile,'-Engine',$Engine,'-Run') | Out-Null
  exit 0
}
Set-Location -LiteralPath $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'bridge.config.json') -Raw | ConvertFrom-Json
foreach ($name in @('OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GENAI_USE_VERTEXAI')) {
  [Environment]::SetEnvironmentVariable($name,$null,'Process')
}
Write-Host 'WuPage: sign in with your own account. This window does not start translation.'
switch ($Engine) {
  'codex' { & $config.codexPath login }
  'claude' { & $config.claudePath auth login }
  'gemini' {
    if ([IO.Path]::GetExtension($config.geminiPath) -in @('.js','.mjs')) { & $config.nodePath $config.geminiPath }
    else { & $config.geminiPath }
  }
}
