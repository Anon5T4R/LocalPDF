// Camada fina sobre o pdf.js: carregar documento, renderizar página, extrair texto.
// O pdf.js TRANSFERE o ArrayBuffer pro worker — sempre passar uma cópia dos bytes.

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
// worker empacotado pelo Vite (offline por construção)
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, RenderTask };

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

/**
 * Renderiza uma página no canvas na escala dada (multiplicada pelo DPR).
 * Devolve a RenderTask pra quem chamou poder cancelar.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): { promise: Promise<void>; cancel: () => void } {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
    canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
    const ctx = canvas.getContext("2d")!;
    task = page.render({
      canvasContext: ctx,
      viewport: vp,
      // ENABLE (1): desenha a APARÊNCIA das anotações/widgets no canvas —
      // é o que faz valores de formulário preenchidos aparecerem.
      annotationMode: 1,
    });
    await task.promise;
  })().catch((e) => {
    // cancelamento de render não é erro
    if (e?.name !== "RenderingCancelledException") throw e;
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** Texto de todas as páginas (uma string por página). */
export async function extractAllText(doc: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str + (("hasEOL" in it && it.hasEOL) ? "\n" : "") : ""))
      .join(" ");
    out.push(text);
  }
  return out;
}
