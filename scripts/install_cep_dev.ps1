# Installs the panel for this user: a link to the project's cep folder (no Python installation, no system-wide files).
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$source = Join-Path $project 'cep'
$target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\NOIRCaptions'
if (-not (Test-Path (Join-Path $source 'CSXS\manifest.xml'))) { throw 'CEP manifest not found.' }
# The panel is installed as a LINK (directory junction) to the project's cep folder: after `git pull` AE shows the new panel
# at once, nothing to copy again. If a junction cannot be made, the folder is copied as before.
$item = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    cmd /c rmdir "$target" | Out-Null                                   # removes only the old link, never the project files
} elseif ($item) {
    $backup = Join-Path $env:LOCALAPPDATA ('NOIR Captions\cep-backups\' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Recurse
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Previous extension copied to: $backup"
}
New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
$linked = $false
try { New-Item -ItemType Junction -Path $target -Target $source -ErrorAction Stop | Out-Null; $linked = $true }
catch { Write-Host "Could not create a link ($($_.Exception.Message)); copying instead." -ForegroundColor Yellow }
if (-not $linked) {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
}
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
if ($linked) { Write-Host 'Linked to the project: from now on git pull is enough (then restart AE).' } else { Write-Host 'Copied: after every git pull run this script again.' }
Write-Host 'Restart AE. Open Window > Extensions (Legacy) > NOIR Captions.'
