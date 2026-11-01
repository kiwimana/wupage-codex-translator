param([switch]$PrepareOnly, [ValidateSet('Firefox','Chrome','Both')][string]$Browser='Both', [string]$CodexPath, [string]$ClaudePath, [string]$GeminiPath, [string]$NodePath)
$ErrorActionPreference = 'Stop'
$bridgeDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
$previousConfig = $null
$configFile = Join-Path $bridgeDirectory 'bridge.config.json'
if (Test-Path -LiteralPath $configFile) {
  try { $previousConfig = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json } catch { }
}
function Resolve-BridgeProgram([string]$name, [string[]]$candidates, [switch]$Optional) {
  $command = if ($name) { Get-Command $name -ErrorAction SilentlyContinue } else { $null }
  if ($command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) { return $command.Source }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return [System.IO.Path]::GetFullPath($candidate) }
  }
  if (-not $Optional) { throw "Cannot locate $name. Install the required application and run this repair again." }
}
$nodePath = if ($NodePath) { Resolve-BridgeProgram '' @($NodePath) } else {
  Resolve-BridgeProgram 'node.exe' @($previousConfig.nodePath, (Join-Path $env:ProgramFiles 'nodejs\node.exe'))
}
$codexCandidates = @($CodexPath, $previousConfig.codexPath)
$codexDesktopBin = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
if (Test-Path -LiteralPath $codexDesktopBin) {
  $codexCandidates += @(Get-ChildItem -LiteralPath $codexDesktopBin -Directory |
    Sort-Object LastWriteTime -Descending | ForEach-Object { Join-Path $_.FullName 'codex.exe' })
}
$codexPath = if ($CodexPath) { Resolve-BridgeProgram '' @($CodexPath) } else {
  Resolve-BridgeProgram 'codex.exe' $codexCandidates -Optional
}
$claudePath = if ($ClaudePath) { Resolve-BridgeProgram '' @($ClaudePath) } else {
  Resolve-BridgeProgram 'claude.exe' @($previousConfig.claudePath, (Join-Path $env:USERPROFILE '.local\bin\claude.exe')) -Optional
}
$geminiPath = if ($GeminiPath) { Resolve-BridgeProgram '' @($GeminiPath) } else {
  Resolve-BridgeProgram 'gemini' @($previousConfig.geminiPath) -Optional
}
if ($geminiPath -and [IO.Path]::GetExtension($geminiPath) -in @('.cmd', '.ps1')) {
  $package = Join-Path (Split-Path $geminiPath) 'node_modules\@google\gemini-cli'
  $packageFile = Join-Path $package 'package.json'
  if (Test-Path -LiteralPath $packageFile) {
    $entry = (Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json).bin.gemini
    $geminiPath = Resolve-BridgeProgram '' @((Join-Path $package $entry))
  } else { throw 'Cannot resolve Gemini CLI JavaScript entry. Use -GeminiPath with its full .js path.' }
}
if (-not $codexPath -and -not $claudePath -and -not $geminiPath) { throw 'Install Codex, Claude Code, or Gemini CLI, then run this installer again.' }
$config = @{ nodePath = $nodePath; codexPath = $codexPath; claudePath = $claudePath; geminiPath = $geminiPath }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $bridgeDirectory 'bridge.config.json'), ($config | ConvertTo-Json), $utf8)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$launcher = Join-Path $bridgeDirectory 'wupage-chatgpt-host.exe'
& $compiler /nologo /target:exe /reference:System.Web.Extensions.dll "/out:$launcher" (Join-Path $bridgeDirectory 'launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile the native host launcher.' }
$manifest = @{ name = 'org.wupage.codex_bridge'; description = 'WuPage ChatGPT account translation (ephemeral Codex)';
  path = $launcher; type = 'stdio'; allowed_extensions = @('codex-translator@wupage.local') }
$manifestFile = Join-Path $bridgeDirectory 'org.wupage.codex_bridge.json'
[System.IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json), $utf8)
$chromeIdentity = Get-Content -LiteralPath (Join-Path $bridgeDirectory 'chrome-extension.json') -Raw | ConvertFrom-Json
if ($chromeIdentity.extensionId -notmatch '^[a-p]{32}$') { throw 'Invalid Chrome extension identity.' }
$chromeOrigin = 'chrome-extension://' + $chromeIdentity.extensionId + '/'
$chromeManifest = @{ name = $manifest.name; description = 'WuPage local account translation'; path = $launcher; type = 'stdio'; allowed_origins = @($chromeOrigin) }
$chromeManifestFile = Join-Path $bridgeDirectory 'org.wupage.codex_bridge.chrome.json'
[System.IO.File]::WriteAllText($chromeManifestFile, ($chromeManifest | ConvertTo-Json), $utf8)
if ($PrepareOnly) { Write-Output 'Prepared bridge configuration and executable; registry unchanged.'; exit 0 }
$targets = @()
if ($Browser -in @('Firefox','Both')) { $targets += @{ Path = 'Software\Mozilla\NativeMessagingHosts\org.wupage.codex_bridge'; Manifest = $manifestFile; Allowed = 'allowed_extensions'; Identity = 'codex-translator@wupage.local' } }
if ($Browser -in @('Chrome','Both')) { $targets += @{ Path = 'Software\Google\Chrome\NativeMessagingHosts\org.wupage.codex_bridge'; Manifest = $chromeManifestFile; Allowed = 'allowed_origins'; Identity = $chromeOrigin } }
$views = @([Microsoft.Win32.RegistryView]::Registry32)
if ([Environment]::Is64BitOperatingSystem) { $views += [Microsoft.Win32.RegistryView]::Registry64 }
foreach ($view in $views) {
  $registryRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
  try {
    foreach ($target in $targets) {
      $registryHost = $registryRoot.CreateSubKey($target.Path)
      try {
        $existingManifest = $registryHost.GetValue('')
        if ($existingManifest -and $existingManifest -ne $target.Manifest -and (Test-Path -LiteralPath $existingManifest)) {
          $existingHost = Get-Content -LiteralPath $existingManifest -Raw | ConvertFrom-Json
          if ($existingHost.name -ne $manifest.name -or $target.Identity -notin $existingHost.($target.Allowed)) {
            throw 'This host name belongs to another application. Its registration was not changed.'
          }
        }
        $registryHost.SetValue('', $target.Manifest, [Microsoft.Win32.RegistryValueKind]::String)
        $registryHost.Flush()
        if ($registryHost.GetValue('') -ne $target.Manifest) { throw 'Native host registry verification failed.' }
      } finally { $registryHost.Dispose() }
    }
  } finally { $registryRoot.Dispose() }
}
Write-Output 'Installed WuPage native bridge for the current Windows user. No background service was started.'
Write-Output 'Verified the native manifest path and the current-user registry entry.'
Write-Output "Registered for $Browser. If the host was missing, restart that browser and reload the extension."
