// OCR offline com tesseract.js (Apache-2.0). Worker, core WASM e os idiomas
// (por/eng, tessdata_fast) são servidos de public/tesseract — montados por
// scripts/fetch-tessdata e empacotados no app: nada sai da máquina.

import { createWorker, type Worker } from "tesseract.js";
import type { PDFDocumentProxy } from "./pdfjs";
import type { OcrResult, OcrWord } from "./types";

let worker: Worker | null = null;
let workerLangs = "";

async function getWorker(langs: string): Promise<Worker> {
  if (worker && workerLangs === langs) return worker;
  if (worker) {
    await worker.terminate().catch(() => {});
    worker = null;
  }
  worker = await createWorker(langs.split("+"), 1, {
    workerPath: "/tesseract/worker.min.js",
    // corePath é DIRETÓRIO de propósito. Apontar pra um arquivo faz o
    // getCore.js do tesseract.js usá-lo cru e congelar a variante; como
    // diretório, ele detecta relaxedsimd/simd em runtime e escolhe entre as 3
    // que o fetch-tessdata copiou — o CPU do usuário decide, não a gente.
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    gzip: false,
  });
  workerLangs = langs;
  return worker;
}

/** Escala de render pro OCR (~144 dpi) — bom equilíbrio precisão × memória. */
const OCR_SCALE = 2;

/** Reconhece uma página: renderiza num canvas off-screen e roda o tesseract. */
export async function ocrPage(doc: PDFDocumentProxy, pageIndex: number, langs: string): Promise<OcrResult> {
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: OCR_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;

  const w = await getWorker(langs);
  const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });

  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const par of block.paragraphs) {
      for (const line of par.lines) {
        for (const wd of line.words) {
          const t = wd.text.trim();
          if (!t) continue;
          words.push({
            text: t,
            x: wd.bbox.x0 / OCR_SCALE,
            y: wd.bbox.y0 / OCR_SCALE,
            w: (wd.bbox.x1 - wd.bbox.x0) / OCR_SCALE,
            h: (wd.bbox.y1 - wd.bbox.y0) / OCR_SCALE,
          });
        }
      }
    }
  }
  canvas.width = 0; // libera a RAM do canvas
  return { text: (data.text ?? "").trim(), words };
}

export async function disposeOcr(): Promise<void> {
  if (worker) {
    await worker.terminate().catch(() => {});
    worker = null;
    workerLangs = "";
  }
}
