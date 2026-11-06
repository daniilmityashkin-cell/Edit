<#
 NOIR Captions: install Cyrillic fonts for subtitles (Windows, no administrator rights needed).
 Fonts are free (SIL Open Font License) from the Google Fonts repository, plus any .ttf/.otf files or .zip archives you put into fonts\user. They are installed for the current user
 into %LOCALAPPDATA%\Microsoft\Windows\Fonts. Fonts that are already installed are skipped. Restart After Effects afterwards.

 Run from the project folder:
   powershell -ExecutionPolicy Bypass -File scripts\install_fonts.ps1
 Only list the fonts, download nothing:
   powershell -ExecutionPolicy Bypass -File scripts\install_fonts.ps1 -List
 (This file is ASCII-only on purpose: Windows PowerShell 5 reads files without BOM as ANSI.)
#>
param([switch]$List)
$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
# folder | file | registry name | purpose
$fonts = @(
  @('montserrat','Montserrat[wght].ttf','Montserrat','main sans, captions'),
  @('montserrat','Montserrat-Italic[wght].ttf','Montserrat Italic','italic sans'),
  @('playfairdisplay','PlayfairDisplay[wght].ttf','Playfair Display','serif, headlines'),
  @('playfairdisplay','PlayfairDisplay-Italic[wght].ttf','Playfair Display Italic','gold/silver italic accents'),
  @('inter','Inter[opsz,wght].ttf','Inter','neutral sans'),
  @('roboto','Roboto[wdth,wght].ttf','Roboto','neutral sans'),
  @('opensans','OpenSans[wdth,wght].ttf','Open Sans','neutral sans'),
  @('manrope','Manrope[wght].ttf','Manrope','modern sans'),
  @('onest','Onest[wght].ttf','Onest','modern sans'),
  @('raleway','Raleway[wght].ttf','Raleway','elegant sans'),
  @('rubik','Rubik[wght].ttf','Rubik','rounded sans'),
  @('oswald','Oswald[wght].ttf','Oswald','condensed, poster'),
  @('bebasneue','BebasNeue-Regular.ttf','Bebas Neue','condensed caps'),
  @('russoone','RussoOne-Regular.ttf','Russo One','tech, bold'),
  @('exo2','Exo2[wght].ttf','Exo 2','tech'),
  @('unbounded','Unbounded[wght].ttf','Unbounded','wide display'),
  @('comfortaa','Comfortaa[wght].ttf','Comfortaa','rounded'),
  @('lora','Lora[wght].ttf','Lora','book serif'),
  @('lora','Lora-Italic[wght].ttf','Lora Italic','book italic'),
  @('cormorant','Cormorant[wght].ttf','Cormorant','elegant serif'),
  @('cormorant','Cormorant-Italic[wght].ttf','Cormorant Italic','elegant italic'),
  @('notoserifdisplay','NotoSerifDisplay[wdth,wght].ttf','Noto Serif Display','high-contrast serif'),
  @('philosopher','Philosopher-Regular.ttf','Philosopher','characterful serif'),
  @('philosopher','Philosopher-BoldItalic.ttf','Philosopher Bold Italic','bold italic'),
  @('ptserif','PT_Serif-Web-Regular.ttf','PT Serif','serif'),
  @('ptsans','PT_Sans-Web-Regular.ttf','PT Sans','sans'),
  @('lobster','Lobster-Regular.ttf','Lobster','handwritten'),
  @('pacifico','Pacifico-Regular.ttf','Pacifico','handwritten'),
  @('caveat','Caveat[wght].ttf','Caveat','handwritten'),
  @('marckscript','MarckScript-Regular.ttf','Marck Script','calligraphy')
)
if ($List) { $fonts | ForEach-Object { '{0,-26} {1}' -f $_[2], $_[3] }; return }

$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$reg = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$installed = 0; $skipped = 0; $failed = @()

function Register-FontFile($path, $regName, $kind) {
  New-ItemProperty -Path $reg -Name ($regName + ' (' + $kind + ')') -Value $path -PropertyType String -Force | Out-Null
}

function Install-UserFont($file) {
  $target = Join-Path $dir $file.Name
  if (Test-Path $target) { $script:skipped++; return }
  try {
    Copy-Item -Force $file.FullName $target
    $kind = if ($file.Extension -ieq '.otf') { 'OpenType' } else { 'TrueType' }
    Register-FontFile $target $file.BaseName $kind
    $script:installed++; Write-Host ("  + {0} (yours)" -f $file.Name)
  } catch { $script:failed += ("{0}: {1}" -f $file.Name, $_.Exception.Message) }
}

# 1) your own fonts from fonts\user: loose .ttf/.otf files and .zip archives (fonts are taken out of the zip, nothing is run)
$mine = Join-Path (Split-Path -Parent $PSScriptRoot) 'fonts\user'
if (Test-Path $mine) {
  Get-ChildItem -Path $mine -File | Where-Object { $_.Extension -match '^\.(ttf|otf)$' } | ForEach-Object { Install-UserFont $_ }
  Get-ChildItem -Path $mine -File -Filter *.zip | ForEach-Object {
    $zipName = $_.Name
    $tmpDir = Join-Path $env:TEMP ('noir_fonts_' + [Guid]::NewGuid().ToString('N'))
    try {
      Expand-Archive -Path $_.FullName -DestinationPath $tmpDir -Force
      $inside = @(Get-ChildItem -Path $tmpDir -Recurse -File | Where-Object { $_.Extension -match '^\.(ttf|otf)$' -and $_.FullName -notmatch '__MACOSX' })
      # a variable font next to its static files duplicates the family: keep the static ones
      if ($inside.Count -gt 1) { $inside = @($inside | Where-Object { $_.Name -notmatch 'VF\.(ttf|otf)$' }) }
      foreach ($one in $inside) { Install-UserFont $one }
    } catch { $script:failed += ("{0}: {1}" -f $zipName, $_.Exception.Message) }
    finally { if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir } }
  }
}

# 2) free Cyrillic set from Google Fonts
foreach ($f in $fonts) {
  $name = $f[1] -replace '[\[\],]', '_'      # safe file name: Montserrat[wght].ttf -> Montserrat_wght_.ttf
  $target = Join-Path $dir $name
  if (Test-Path $target) { $skipped++; continue }
  $url = "$base/$($f[0])/" + [Uri]::EscapeDataString($f[1])
  $tmp = Join-Path $env:TEMP ('noir_font_' + [Guid]::NewGuid().ToString('N') + '.ttf')
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $bytes = [IO.File]::ReadAllBytes($tmp)
    $magic = ($bytes[0..3] | ForEach-Object { $_.ToString('X2') }) -join ''
    if ($bytes.Length -lt 20000 -or ($magic -ne '00010000' -and $magic -ne '74727565')) { throw "not a TrueType font ($($bytes.Length) bytes)" }
    Move-Item -Force $tmp $target
    Register-FontFile $target $f[2] 'TrueType'
    $installed++
    Write-Host ("  + {0}" -f $f[2])
  } catch {
    $failed += ("{0}: {1}" -f $f[2], $_.Exception.Message)
    if (Test-Path $tmp) { Remove-Item -Force $tmp }
  }
}
Write-Host ''
Write-Host ("Installed: {0}, already present: {1}, errors: {2}" -f $installed, $skipped, $failed.Count)
$failed | ForEach-Object { Write-Host ("  ! " + $_) }
Write-Host 'Restart After Effects so the fonts appear in its lists.'
Write-Host 'Font license: SIL Open Font License 1.1 (see github.com/google/fonts).'
