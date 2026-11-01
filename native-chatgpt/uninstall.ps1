param([ValidateSet('Firefox','Chrome','Both')][string]$Browser='Both')
$ErrorActionPreference = 'Stop'
$targets = @()
if ($Browser -in @('Firefox','Both')) { $targets += @{ Path = 'Software\Mozilla\NativeMessagingHosts\org.wupage.codex_bridge'; File = 'org.wupage.codex_bridge.json' } }
if ($Browser -in @('Chrome','Both')) { $targets += @{ Path = 'Software\Google\Chrome\NativeMessagingHosts\org.wupage.codex_bridge'; File = 'org.wupage.codex_bridge.chrome.json' } }
$views = @([Microsoft.Win32.RegistryView]::Registry32)
if ([Environment]::Is64BitOperatingSystem) { $views += [Microsoft.Win32.RegistryView]::Registry64 }
foreach ($view in $views) {
  $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
  try {
    foreach ($target in $targets) {
      $existing = $root.OpenSubKey($target.Path)
      $matches = $false
      if ($existing) {
        try { $matches = $existing.GetValue('') -eq (Join-Path $PSScriptRoot $target.File) } finally { $existing.Dispose() }
      }
      if ($matches) { $root.DeleteSubKey($target.Path, $false); Write-Output 'Removed this installation native messaging registration.' }
    }
  } finally { $root.Dispose() }
}
Write-Output 'Account logins and chats were not changed.'
