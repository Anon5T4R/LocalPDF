// Operações sobre o documento com pdf-lib: bytes entram, bytes saem.
// Tudo puro e testável em Node (o pdf.js fica só na renderização).
//
// Caveat conhecido (v0.1): reordenar/extrair/mesclar usa copyPages do pdf-lib,
// que copia os widgets mas NÃO reconstrói o AcroForm — campos de formulário
// dessas páginas param de ser editáveis. Rotacionar/excluir preservam o form.

import {
  BlendMode,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import type { Annot, AnnotMap, FieldInfo } from "./types";
import { hexToRgb01, normalizeRotation, sanitizeWinAnsi, toPdfPoint, toPdfRect, type PageGeom } from "./coords";

const load = (bytes: Uint8Array) => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });

async function saveDoc(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

/** Nova ordem completa das páginas (índices 0-based da ordem antiga). */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await load(bytes);
  const n = src.getPageCount();
  if (order.length !== n || [...order].sort((a, b) => a - b).some((v, i) => v !== i)) {
    throw new Error("ordem inválida: precisa ser uma permutação de todas as páginas");
  }
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  for (const p of pages) out.addPage(p);
  return saveDoc(out);
}

/** Gira as páginas indicadas em +delta graus (múltiplo de 90). */
export async function rotatePages(bytes: Uint8Array, indices: number[], delta: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  for (const i of indices) {
    const page = doc.getPage(i);
    const cur = normalizeRotation(page.getRotation().angle);
    page.setRotation(degrees(normalizeRotation(cur + delta)));
  }
  return saveDoc(doc);
}

/** Remove as páginas indicadas (preserva o AcroForm das restantes). */
export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  if (indices.length >= doc.getPageCount()) throw new Error("não dá pra excluir todas as páginas");
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  for (const i of sorted) doc.removePage(i);
  return saveDoc(doc);
}

/** Extrai as páginas indicadas (na ordem dada) pra um novo documento. */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  return saveDoc(out);
}

/** Acrescenta todas as páginas de `otherBytes` ao fim (mesclar). */
export async function mergePdf(bytes: Uint8Array, otherBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await load(bytes);
  const other = await load(otherBytes);
  const pages = await doc.copyPages(other, other.getPageIndices());
  for (const p of pages) doc.addPage(p);
  return saveDoc(doc);
}

function pageGeom(doc: PDFDocument, index: number): PageGeom {
  const page = doc.getPage(index);
  const { width, height } = page.getSize();
  return { w: width, h: height, rotation: normalizeRotation(page.getRotation().angle) };
}

/** "Queima" as anotações pendentes nas páginas (realce, texto, desenho). */
export async function bakeAnnotations(bytes: Uint8Array, annots: AnnotMap): Promise<Uint8Array> {
  const entries = Object.entries(annots).filter(([, list]) => list.length > 0);
  if (!entries.length) return bytes;
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const [key, list] of entries) {
    const index = Number(key);
    if (index < 0 || index >= doc.getPageCount()) continue;
    const page = doc.getPage(index);
    const g = pageGeom(doc, index);

    for (const a of list as Annot[]) {
      const { r, g: gr, b } = hexToRgb01(a.kind === "highlight" ? a.color : (a as { color: string }).color);
      const color = rgb(r, gr, b);
      if (a.kind === "highlight") {
        const rect = toPdfRect(g, a.x, a.y, a.w, a.h);
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: rect.h,
          color,
          opacity: 0.35,
          blendMode: BlendMode.Multiply,
        });
      } else if (a.kind === "ink") {
        for (let i = 1; i < a.points.length; i++) {
          const p0 = toPdfPoint(g, a.points[i - 1].x, a.points[i - 1].y);
          const p1 = toPdfPoint(g, a.points[i].x, a.points[i].y);
          page.drawLine({
            start: { x: p0.x, y: p0.y },
            end: { x: p1.x, y: p1.y },
            thickness: a.width,
            color,
            lineCap: 1 as never, // LineCapStyle.Round
            opacity: 1,
          });
        }
      } else if (a.kind === "text") {
        const text = sanitizeWinAnsi(a.text);
        if (!text.trim()) continue;
        // âncora = ponto do baseline da primeira linha, no viewport
        const anchor = toPdfPoint(g, a.x, a.y + a.size * 0.85);
        page.drawText(text, {
          x: anchor.x,
          y: anchor.y,
          size: a.size,
          font,
          color,
          lineHeight: a.size * 1.25,
          rotate: degrees(g.rotation),
        });
      }
    }
  }
  return saveDoc(doc);
}

/** Lista os campos AcroForm do documento. */
export async function listFormFields(bytes: Uint8Array): Promise<FieldInfo[]> {
  const doc = await load(bytes);
  const out: FieldInfo[] = [];
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return out;
  }
  for (const f of fields) {
    const name = f.getName();
    try {
      if (f instanceof PDFTextField) {
        out.push({ name, type: "text", value: f.getText() ?? "", multiline: f.isMultiline() });
      } else if (f instanceof PDFCheckBox) {
        out.push({ name, type: "checkbox", value: f.isChecked() });
      } else if (f instanceof PDFRadioGroup) {
        out.push({ name, type: "radio", value: f.getSelected() ?? "", options: f.getOptions() });
      } else if (f instanceof PDFDropdown) {
        out.push({ name, type: "dropdown", value: f.getSelected()[0] ?? "", options: f.getOptions() });
      } else if (f instanceof PDFOptionList) {
        out.push({ name, type: "option-list", value: f.getSelected()[0] ?? "", options: f.getOptions() });
      } else {
        out.push({ name, type: "other", value: "" });
      }
    } catch {
      out.push({ name, type: "other", value: "" });
    }
  }
  return out;
}

/** Preenche campos AcroForm e regenera as aparências (pro render mostrar). */
export async function fillForm(
  bytes: Uint8Array,
  values: Record<string, string | boolean>
): Promise<Uint8Array> {
  const doc = await load(bytes);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [name, value] of Object.entries(values)) {
    const f = form.getField(name);
    if (f instanceof PDFTextField) {
      f.setText(sanitizeWinAnsi(String(value)));
    } else if (f instanceof PDFCheckBox) {
      if (value) f.check();
      else f.uncheck();
    } else if (f instanceof PDFRadioGroup) {
      if (typeof value === "string" && value) f.select(value);
    } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
      if (typeof value === "string" && value) f.select(value);
    }
  }
  form.updateFieldAppearances(font);
  return saveDoc(doc);
}

/** Geometria (tamanho + rotação) de todas as páginas — pro layout do viewer. */
export async function allPageGeoms(bytes: Uint8Array): Promise<PageGeom[]> {
  const doc = await load(bytes);
  return doc.getPageIndices().map((i) => pageGeom(doc, i));
}
