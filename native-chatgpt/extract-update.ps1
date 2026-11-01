param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$target = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $target -PathType Container) -or (Get-ChildItem -LiteralPath $target -Force).Count) { throw 'Destination must be an empty staging directory.' }
$prefix = $target.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$expanded = 0
  if ($zip.Entries.Count -gt 3000) { throw 'Too many archive entries.' }
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    $expanded += $entry.Length
    if ($expanded -gt 100000000 -or $entry.Length -gt 30000000) { throw 'Expanded archive is too large.' }
    if (-not $name -or $name.Contains('\') -or $name.Contains(':') -or $name.StartsWith('/') -or $name -match '(^|/)\.{1,2}(/|$)' -or -not $seen.Add($name)) { throw 'Unsafe archive member.' }
    if (($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000) { throw 'Symlink members are not allowed.' }
    $output = [IO.Path]::GetFullPath((Join-Path $target $name))
    if (-not $output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive traversal is not allowed.' }
    if ($name.EndsWith('/')) { [IO.Directory]::CreateDirectory($output) | Out-Null; continue }
    if ([IO.Path]::GetExtension($output) -in @('.exe','.dll','.cmd','.bat','.ps1','.vbs','.com','.lnk') -or $name -match '(^|/)(\.git|bridge\.config\.json)(/|$)') { throw 'Unexpected executable or local configuration.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$output,$false)
  }
  if (-not (Test-Path -LiteralPath (Join-Path $target 'manifest.json') -PathType Leaf)) { throw 'Missing root manifest.' }
} finally { $zip.Dispose() }
