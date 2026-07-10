#!/usr/bin/env bash
# Monta public/tesseract (gitignored): worker+core do node_modules e os idiomas
# por/eng do tessdata_fast. O vite empacota public/ no dist → OCR 100% offline.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/public/tesseract"
mkdir -p "$dest/lang" "$dest/core"

# Só as variantes LSTM (o tesseract.js usa OEM LSTM_ONLY; as "full" dobram o tamanho)
cp "$root/node_modules/tesseract.js/dist/worker.min.js" "$dest/"
cp "$root"/node_modules/tesseract.js-core/tesseract-core*lstm* "$dest/core/"

for l in por eng; do
  out="$dest/lang/$l.traineddata"
  if [ -f "$out" ]; then echo "$l.traineddata já existe"; continue; fi
  echo "Baixando $l.traineddata (tessdata_fast)..."
  curl -fsSL -o "$out" "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata"
done
echo "OCR assets em $dest"
