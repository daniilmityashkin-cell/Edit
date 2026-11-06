<#
 NOIR Captions: установка кириллических шрифтов для субтитров (Windows, без прав администратора).
 Шрифты — свободные (SIL Open Font License) из репозитория Google Fonts. Ставятся для текущего пользователя
 в %LOCALAPPDATA%\Microsoft\Windows\Fonts. Уже установленные пропускаются. После установки перезапустите After Effects.

 Запуск из папки проекта:
   powershell -ExecutionPolicy Bypass -File scripts\install_fonts.ps1
 Только показать список, ничего не скачивая:
   powershell -ExecutionPolicy Bypass -File scripts\install_fonts.ps1 -List
#>
param([switch]$List)
$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
# папка | файл | подпись в реестре | для чего
$fonts = @(
  @('montserrat','Montserrat[wght].ttf','Montserrat','основной гротеск, подписи'),
  @('montserrat','Montserrat-Italic[wght].ttf','Montserrat Italic','курсивный гротеск'),
  @('playfairdisplay','PlayfairDisplay[wght].ttf','Playfair Display','антиква, заголовки'),
  @('playfairdisplay','PlayfairDisplay-Italic[wght].ttf','Playfair Display Italic','золотой/серебряный курсив'),
  @('inter','Inter[opsz,wght].ttf','Inter','нейтральный гротеск'),
  @('roboto','Roboto[wdth,wght].ttf','Roboto','нейтральный гротеск'),
  @('opensans','OpenSans[wdth,wght].ttf','Open Sans','нейтральный гротеск'),
  @('manrope','Manrope[wght].ttf','Manrope','современный гротеск'),
  @('onest','Onest[wght].ttf','Onest','современный гротеск'),
  @('raleway','Raleway[wght].ttf','Raleway','элегантный гротеск'),
  @('rubik','Rubik[wght].ttf','Rubik','округлый гротеск'),
  @('oswald','Oswald[wght].ttf','Oswald','узкий, плакатный'),
  @('bebasneue','BebasNeue-Regular.ttf','Bebas Neue','узкий капс'),
  @('russoone','RussoOne-Regular.ttf','Russo One','техно, жирный'),
  @('exo2','Exo2[wght].ttf','Exo 2','техно'),
  @('unbounded','Unbounded[wght].ttf','Unbounded','широкий дисплейный'),
  @('comfortaa','Comfortaa[wght].ttf','Comfortaa','округлый'),
  @('lora','Lora[wght].ttf','Lora','книжная антиква'),
  @('lora','Lora-Italic[wght].ttf','Lora Italic','книжный курсив'),
  @('cormorant','Cormorant[wght].ttf','Cormorant','изящная антиква'),
  @('cormorant','Cormorant-Italic[wght].ttf','Cormorant Italic','изящный курсив'),
  @('notoserifdisplay','NotoSerifDisplay[wdth,wght].ttf','Noto Serif Display','контрастная антиква'),
  @('philosopher','Philosopher-Regular.ttf','Philosopher','антиква с характером'),
  @('philosopher','Philosopher-BoldItalic.ttf','Philosopher Bold Italic','жирный курсив'),
  @('ptserif','PT_Serif-Web-Regular.ttf','PT Serif','антиква'),
  @('ptsans','PT_Sans-Web-Regular.ttf','PT Sans','гротеск'),
  @('lobster','Lobster-Regular.ttf','Lobster','рукописный'),
  @('pacifico','Pacifico-Regular.ttf','Pacifico','рукописный'),
  @('caveat','Caveat[wght].ttf','Caveat','рукописный'),
  @('marckscript','MarckScript-Regular.ttf','Marck Script','каллиграфия')
)
if ($List) { $fonts | ForEach-Object { '{0,-26} {1}' -f $_[2], $_[3] }; return }

$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$reg = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$installed = 0; $skipped = 0; $failed = @()
foreach ($f in $fonts) {
  $name = $f[1] -replace '[\[\],]', '_'      # безопасное имя файла: Montserrat[wght].ttf -> Montserrat_wght_.ttf
  $target = Join-Path $dir $name
  if (Test-Path $target) { $skipped++; continue }
  $url = "$base/$($f[0])/" + [Uri]::EscapeDataString($f[1])
  $tmp = Join-Path $env:TEMP ('noir_font_' + [Guid]::NewGuid().ToString('N') + '.ttf')
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $bytes = [IO.File]::ReadAllBytes($tmp)
    $magic = ($bytes[0..3] | ForEach-Object { $_.ToString('X2') }) -join ''
    if ($bytes.Length -lt 20000 -or ($magic -ne '00010000' -and $magic -ne '74727565')) { throw "не похоже на шрифт TrueType ($($bytes.Length) байт)" }
    Move-Item -Force $tmp $target
    New-ItemProperty -Path $reg -Name ($f[2] + ' (TrueType)') -Value $target -PropertyType String -Force | Out-Null
    $installed++
    Write-Host ("  + {0}" -f $f[2])
  } catch {
    $failed += ("{0}: {1}" -f $f[2], $_.Exception.Message)
    if (Test-Path $tmp) { Remove-Item -Force $tmp }
  }
}
Write-Host ''
Write-Host ("Установлено: {0}, уже было: {1}, ошибок: {2}" -f $installed, $skipped, $failed.Count)
$failed | ForEach-Object { Write-Host ("  ! " + $_) }
Write-Host 'Перезапустите After Effects, чтобы шрифты появились в списках.'
Write-Host 'Лицензия шрифтов: SIL Open Font License 1.1 (авторские права принадлежат авторам шрифтов, см. github.com/google/fonts).'
