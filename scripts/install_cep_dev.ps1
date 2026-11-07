# Development copy only: no Python installation and no system-wide files.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$source = Join-Path $project 'cep'
$target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\NOIRCaptions'
if (-not (Test-Path (Join-Path $source 'CSXS\manifest.xml'))) { throw 'CEP manifest not found.' }
if (Test-Path $target) {
    $backup = Join-Path $env:LOCALAPPDATA ('NOIR Captions\cep-backups\' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Recurse
    Write-Host "Previous extension copied to: $backup"
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
[IO.File]::WriteAllText((Join-Path $target 'project-root.txt'), $project, (New-Object Text.UTF8Encoding($false)))
# Adobe requires development mode for unsigned local CEP extensions (per-user setting).
foreach ($version in 11..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}
# The old ScriptUI panel (0.20 and earlier) is gone: remove its loader if it was installed into AE.
$old = Get-ChildItem 'C:\Program Files\Adobe' -Directory -Filter 'Adobe After Effects*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'Support Files\Scripts\ScriptUI Panels\NOIR Captions.jsx' } | Where-Object { Test-Path -LiteralPath $_ }
foreach ($f in $old) {
    try { Remove-Item -LiteralPath $f -Force; Write-Host "Removed the old ScriptUI loader: $f" }
    catch { Write-Host "Old ScriptUI loader is still here (run PowerShell as administrator to remove it, or delete it by hand): $f" -ForegroundColor Yellow }
}
Write-Host 'Copied. Restart AE. Open Window > Extensions (Legacy) > NOIR Captions.'
