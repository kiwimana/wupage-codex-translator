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
  'codex' {
    $toolPath = $config.codexPath
    if (-not $toolPath -or -not [IO.Path]::IsPathRooted($toolPath) -or -not (Test-Path -LiteralPath $toolPath -PathType Leaf)) {
      $binRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
      $toolPath = $null
      if (Test-Path -LiteralPath $binRoot -PathType Container) {
        foreach ($versionDirectory in (Get-ChildItem -LiteralPath $binRoot -Directory | Sort-Object LastWriteTime -Descending)) {
          $candidate = Join-Path $versionDirectory.FullName 'codex.exe'
          if (Test-Path -LiteralPath $candidate -PathType Leaf) { $toolPath = $candidate; break }
        }
      }
    }
    if (-not $toolPath) { throw 'Codex was moved or is updating. Open the Codex desktop app, wait for its update, then retry.' }
    & $toolPath login
  }
  'claude' { & $config.claudePath auth login }
  'gemini' {
    if ([IO.Path]::GetExtension($config.geminiPath) -in @('.js','.mjs')) { & $config.nodePath $config.geminiPath }
    else { & $config.geminiPath }
  }
}
