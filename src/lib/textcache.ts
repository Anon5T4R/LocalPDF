// Cache do texto do documento por versão (busca, IA, edição de linha).
// Invalida sozinho quando docVersion muda; OCR entra como fallback de página
// sem texto extraível (PDF escaneado).

import { extractAllText, pageTextItems, type PDFDocumentProxy, type PageTextItem } from "./pdfjs";
import type { OcrResult } from "./types";

let textCache: { version: number; pages: Promise<string[]> } | null = null;
let itemsCache: { version: number; pages: Map<number, Promise<PageTextItem[]>> } | null = null;

export function getPagesText(doc: PDFDocumentProxy, version: number): Promise<string[]> {
  if (!textCache || textCache.version !== version) {
    textCache = { version, pages: extractAllText(doc) };
  }
  return textCache.pages;
}

export function getPageItems(doc: PDFDocumentProxy, version: number, pageIndex: number): Promise<PageTextItem[]> {
  if (!itemsCache || itemsCache.version !== version) {
    itemsCache = { version, pages: new Map() };
  }
  let p = itemsCache.pages.get(pageIndex);
  if (!p) {
    p = pageTextItems(doc, pageIndex + 1);
    itemsCache.pages.set(pageIndex, p);
  }
  return p;
}

/** Texto por página com fallback pro OCR onde o PDF não tem texto. */
export async function getMergedPagesText(
  doc: PDFDocumentProxy,
  version: number,
  ocr: Record<number, OcrResult>
): Promise<string[]> {
  const pages = await getPagesText(doc, version);
  return pages.map((t, i) => (t.trim() ? t : (ocr[i]?.text ?? "")));
}

/** Uma linha de texto reconstruída a partir dos itens (edição de linha). */
export interface TextLine {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/** Agrupa os itens em linhas por baseline próximo; ordena por x. */
export function groupLines(items: PageTextItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PageTextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) < Math.max(last[0].h, it.h) * 0.6) {
      last.push(it);
    } else {
      lines.push([it]);
    }
  }
  return lines.map((parts) => {
    parts.sort((a, b) => a.x - b.x);
    let text = "";
    let prev: PageTextItem | null = null;
    for (const p of parts) {
      if (prev) {
        const gap = p.x - (prev.x + prev.w);
        if (gap > prev.h * 0.15 && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " ";
      }
      text += p.str;
      prev = p;
    }
    const x = Math.min(...parts.map((p) => p.x));
    const y = Math.min(...parts.map((p) => p.y));
    const right = Math.max(...parts.map((p) => p.x + p.w));
    const bottom = Math.max(...parts.map((p) => p.y + p.h));
    return { x, y, w: right - x, h: bottom - y, text: text.trim() };
  });
}

/** Acha a linha sob o ponto (com folga pequena). */
export function hitLine(lines: TextLine[], x: number, y: number): TextLine | null {
  for (const l of lines) {
    if (x >= l.x - 2 && x <= l.x + l.w + 2 && y >= l.y - 2 && y <= l.y + l.h + 2) return l;
  }
  return null;
}
