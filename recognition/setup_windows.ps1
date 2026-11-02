# NOIR CAPTIONS — установка движка распознавания (Windows).
# Запуск из папки проекта:
#   powershell -ExecutionPolicy Bypass -File recognition\setup_windows.ps1
# Что делает: создаёт .venv в папке проекта и ставит туда faster-whisper
# (+ CUDA-библиотеки, если есть видеокарта NVIDIA). Систему, драйверы и PATH не меняет.
# Модели НЕ скачивает — это произойдёт при первом распознавании (панель спросит).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Python {
    foreach ($v in @("3.12", "3.11", "3.13")) {
        try { $p = & py "-$v" -c "import sys; print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $p) { return $p.Trim() } } catch {}
    }
    try { $p = & python -c "import sys; print(sys.executable) if sys.version_info >= (3,9) else None" 2>$null; if ($p) { return $p.Trim() } } catch {}
    return $null
}

$py = Find-Python
if (-not $py) {
    Write-Host "Python 3.11/3.12 не найден. Установите с https://www.python.org/downloads/ (галочка 'Add python.exe to PATH') и запустите снова." -ForegroundColor Red
    exit 1
}
Write-Host "Python: $py"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Создаю .venv ..."
    & $py -m venv .venv
}
$vpy = Join-Path $root ".venv\Scripts\python.exe"
& $vpy -m pip install --upgrade pip
& $vpy -m pip install -r recognition\requirements.txt

$hasNvidia = $false
try { & nvidia-smi -L | Out-Host; if ($LASTEXITCODE -eq 0) { $hasNvidia = $true } } catch {}
if ($hasNvidia) {
    Write-Host "Найдена NVIDIA — ставлю CUDA-библиотеки в .venv ..."
    & $vpy -m pip install -r recognition\requirements-gpu.txt
} else {
    Write-Host "NVIDIA не найдена — распознавание будет на CPU (медленнее)." -ForegroundColor Yellow
}

Write-Host "`nПроверка:"
& $vpy -c "import sys; sys.path.insert(0, 'recognition'); import noir_recognize as n; n.add_cuda_dll_dirs(); import faster_whisper, ctranslate2; print('faster-whisper', faster_whisper.__version__, '| CUDA устройств:', ctranslate2.get_cuda_device_count())"
Write-Host "`nГотово. Python для панели: $vpy" -ForegroundColor Green
