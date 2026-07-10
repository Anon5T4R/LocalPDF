# Monta public/tesseract (gitignored): worker+core copiados do node_modules e
# os idiomas por/eng baixados do tessdata_fast. O vite empacota public/ no dist,
# então o OCR fica 100% offline no app final.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/fetch-tessdata.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "public\tesseract"
$lang = Join-Path $dest "lang"
$core = Join-Path $dest "core"
New-Item -ItemType Directory -Force -Path $lang | Out-Null
New-Item -ItemType Directory -Force -Path $core | Out-Null

# Só as variantes LSTM (o tesseract.js usa OEM LSTM_ONLY; as "full" dobram o tamanho)
Copy-Item (Join-Path $root "node_modules\tesseract.js\dist\worker.min.js") $dest -Force
Copy-Item (Join-Path $root "node_modules\tesseract.js-core\tesseract-core*lstm*") $core -Force

foreach ($l in @("por", "eng")) {
    $out = Join-Path $lang "$l.traineddata"
    if (Test-Path $out) { Write-Host "$l.traineddata já existe"; continue }
    Write-Host "Baixando $l.traineddata (tessdata_fast)..."
    Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata" -OutFile $out
}
Write-Host "OCR assets em $dest"
