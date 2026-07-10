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

/** Item de texto com posição, em coords do viewport escala 1 (y = topo). */
export interface PageTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Itens de texto posicionados de uma página (busca, flash, edição de linha). */
export async function pageTextItems(doc: PDFDocumentProxy, pageNumber: number): Promise<PageTextItem[]> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const out: PageTextItem[] = [];
  for (const it of content.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const tx = pdfjs.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(tx[2], tx[3]) || 10;
    out.push({ str: it.str, x: tx[4], y: tx[5] - h * 0.85, w: it.width, h });
  }
  return out;
}

/** Renderiza a camada de texto selecionável do pdf.js dentro do container. */
export function renderTextLayer(
  doc: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLDivElement,
  scale: number
): { promise: Promise<void>; cancel: () => void } {
  let layer: InstanceType<typeof pdfjs.TextLayer> | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return;
    container.textContent = "";
    container.style.setProperty("--scale-factor", String(scale));
    layer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale }),
    });
    await layer.render();
  })().catch(() => {});
  return {
    promise,
    cancel: () => {
      cancelled = true;
      layer?.cancel();
    },
  };
}

/** Entrada do sumário (outline/bookmarks) do PDF, achatada com nível. */
export interface OutlineEntry {
  title: string;
  level: number;
  pageIndex: number; // -1 = destino não resolvível
}

/** Sumário do documento (capítulos), quando o PDF tem outline. */
export async function documentOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const raw = await doc.getOutline().catch(() => null);
  if (!raw?.length) return [];
  const out: OutlineEntry[] = [];
  type Item = { title?: string; dest?: unknown; items?: Item[] };
  const walk = async (items: Item[], level: number) => {
    for (const it of items) {
      let pageIndex = -1;
      try {
        let dest = it.dest;
        if (typeof dest === "string") dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) pageIndex = await doc.getPageIndex(dest[0]);
      } catch {
        /* destino quebrado — mostra o título mesmo assim */
      }
      out.push({ title: it.title?.trim() || "(sem título)", level, pageIndex });
      if (it.items?.length && level < 6) await walk(it.items, level + 1);
    }
  };
  await walk(raw as Item[], 0);
  return out;
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
