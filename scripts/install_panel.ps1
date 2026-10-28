# NOIR CAPTIONS — установка панели в After Effects.
# Запускать в PowerShell ОТ ИМЕНИ АДМИНИСТРАТОРА (папка Program Files защищена):
#   powershell -ExecutionPolicy Bypass -File scripts\install_panel.ps1
# Копирует только маленький загрузчик "NOIR Captions.jsx"; код панели остаётся в папке проекта.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$loader = Join-Path $root "ae\NOIR Captions.jsx"
$targets = Get-ChildItem "C:\Program Files\Adobe" -Directory -Filter "Adobe After Effects*" -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "Support Files\Scripts\ScriptUI Panels" } | Where-Object { Test-Path $_ }
if (-not $targets) { Write-Host "After Effects не найден в C:\Program Files\Adobe" -ForegroundColor Red; exit 1 }
foreach ($t in $targets) {
    try {
        Copy-Item $loader $t -Force
        Write-Host "Установлено: $t" -ForegroundColor Green
    } catch {
        Write-Host "Нет доступа к $t — запустите PowerShell от имени администратора." -ForegroundColor Red
    }
}
Write-Host "Перезапустите AE и откройте Window > NOIR Captions.jsx"
