// pdf-lib roda em Node puro — dá pra testar as operações de verdade,
// criando PDFs sintéticos e verificando o resultado.

import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  allPageGeoms,
  bakeAnnotations,
  bakeInvisibleText,
  deletePages,
  extractPages,
  fillForm,
  insertBlankPage,
  listFormFields,
  mergePdf,
  reorderPages,
  rotatePages,
} from "../ops";

/** PDF de n páginas; cada página tem largura 500+i pra dar pra rastrear a ordem. */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) {
    const page = doc.addPage([500 + i, 700]);
    page.drawText(`pagina ${i + 1}`, { x: 40, y: 650, size: 18, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

const widths = async (bytes: Uint8Array) => (await allPageGeoms(bytes)).map((g) => Math.round(g.w));

describe("reorderPages", () => {
  it("aplica a permutação", async () => {
    const bytes = await makePdf(3);
    const out = await reorderPages(bytes, [2, 0, 1]);
    expect(await widths(out)).toEqual([502, 500, 501]);
  });
  it("rejeita ordem que não é permutação", async () => {
    const bytes = await makePdf(3);
    await expect(reorderPages(bytes, [0, 0, 1])).rejects.toThrow();
    await expect(reorderPages(bytes, [0, 1])).rejects.toThrow();
  });
});

describe("rotatePages", () => {
  it("gira e acumula, normalizando", async () => {
    const bytes = await makePdf(2);
    let out = await rotatePages(bytes, [0], 90);
    let g = await allPageGeoms(out);
    expect(g[0].rotation).toBe(90);
    expect(g[1].rotation).toBe(0);
    out = await rotatePages(out, [0], 90);
    g = await allPageGeoms(out);
    expect(g[0].rotation).toBe(180);
    out = await rotatePages(out, [0], -90);
    g = await allPageGeoms(out);
    expect(g[0].rotation).toBe(90);
  });
});

describe("deletePages", () => {
  it("remove as páginas certas", async () => {
    const bytes = await makePdf(4);
    const out = await deletePages(bytes, [1, 3]);
    expect(await widths(out)).toEqual([500, 502]);
  });
  it("não deixa excluir tudo", async () => {
    const bytes = await makePdf(2);
    await expect(deletePages(bytes, [0, 1])).rejects.toThrow();
  });
});

describe("extractPages / mergePdf", () => {
  it("extrai um subconjunto na ordem pedida", async () => {
    const bytes = await makePdf(4);
    const out = await extractPages(bytes, [3, 1]);
    expect(await widths(out)).toEqual([503, 501]);
  });
  it("mescla ao fim", async () => {
    const a = await makePdf(2);
    const b = await makePdf(3);
    const out = await mergePdf(a, b);
    expect(await widths(out)).toEqual([500, 501, 500, 501, 502]);
  });
});

describe("insertBlankPage", () => {
  it("insere no meio com o tamanho da vizinha", async () => {
    const bytes = await makePdf(3);
    const out = await insertBlankPage(bytes, 1);
    expect(await widths(out)).toEqual([500, 500, 501, 502]); // nova copia a página 1 (500)
  });
  it("insere no fim", async () => {
    const bytes = await makePdf(2);
    const out = await insertBlankPage(bytes, 2);
    expect(await widths(out)).toEqual([500, 501, 501]);
  });
});

// PNG 1x1 vermelho (menor PNG válido) pra testar o carimbo de imagem
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("bakeAnnotations", () => {
  it("queima imagem (assinatura/carimbo), inclusive em página rotacionada", async () => {
    let bytes = await makePdf(2);
    bytes = await rotatePages(bytes, [1], 90);
    const out = await bakeAnnotations(bytes, {
      0: [{ id: "s1", kind: "image", x: 40, y: 600, w: 120, h: 60, dataUrl: TINY_PNG }],
      1: [{ id: "s2", kind: "image", x: 40, y: 100, w: 80, h: 40, dataUrl: TINY_PNG }],
    });
    expect(await widths(out)).toEqual([500, 501]);
    expect(out.length).toBeGreaterThan(bytes.length);
  });
  it("queima realce/texto/desenho sem corromper o documento", async () => {
    const bytes = await makePdf(2);
    const out = await bakeAnnotations(bytes, {
      0: [
        { id: "h1", kind: "highlight", x: 10, y: 10, w: 120, h: 20, color: "#facc15" },
        { id: "t1", kind: "text", x: 40, y: 100, size: 14, color: "#111111", text: "Nota: revisão ação café" },
        { id: "i1", kind: "ink", points: [{ x: 5, y: 5 }, { x: 50, y: 40 }, { x: 90, y: 10 }], color: "#f87171", width: 2 },
      ],
    });
    // reabre limpo e mantém a contagem
    expect(await widths(out)).toEqual([500, 501]);
    expect(out.length).toBeGreaterThan(bytes.length); // conteúdo novo de verdade
  });
  it("queima em página rotacionada sem lançar", async () => {
    let bytes = await makePdf(1);
    bytes = await rotatePages(bytes, [0], 90);
    const out = await bakeAnnotations(bytes, {
      0: [
        { id: "h", kind: "highlight", x: 10, y: 10, w: 60, h: 20, color: "#4ade80" },
        { id: "t", kind: "text", x: 30, y: 50, size: 12, color: "#111111", text: "girada" },
      ],
    });
    expect((await allPageGeoms(out))[0].rotation).toBe(90);
  });
  it("sem anotações devolve os mesmos bytes", async () => {
    const bytes = await makePdf(1);
    expect(await bakeAnnotations(bytes, {})).toBe(bytes);
    expect(await bakeAnnotations(bytes, { 0: [] })).toBe(bytes);
  });
});

describe("bakeInvisibleText (OCR → PDF pesquisável)", () => {
  it("grava as palavras sem mudar contagem de páginas nem lançar", async () => {
    const bytes = await makePdf(2);
    const out = await bakeInvisibleText(bytes, {
      0: [
        { text: "Fatura", x: 40, y: 60, w: 80, h: 16 },
        { text: "nº 1234", x: 130, y: 60, w: 60, h: 16 },
      ],
      1: [{ text: "página escaneada", x: 40, y: 100, w: 200, h: 14 }],
    });
    expect(await widths(out)).toEqual([500, 501]);
    expect(out.length).toBeGreaterThan(bytes.length);
  });
  it("sem palavras devolve os mesmos bytes", async () => {
    const bytes = await makePdf(1);
    expect(await bakeInvisibleText(bytes, {})).toBe(bytes);
    expect(await bakeInvisibleText(bytes, { 0: [] })).toBe(bytes);
  });
});

describe("formulários (AcroForm)", () => {
  async function makeFormPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const form = doc.getForm();
    const name = form.createTextField("nome");
    name.addToPage(page, { x: 50, y: 600, width: 200, height: 24 });
    const ok = form.createCheckBox("aceito");
    ok.addToPage(page, { x: 50, y: 560, width: 18, height: 18 });
    const uf = form.createDropdown("uf");
    uf.setOptions(["SP", "RJ", "MG"]);
    uf.addToPage(page, { x: 50, y: 520, width: 80, height: 24 });
    return doc.save();
  }

  it("lista os campos com tipo e valor", async () => {
    const fields = await listFormFields(await makeFormPdf());
    expect(fields).toEqual([
      { name: "nome", type: "text", value: "", multiline: false },
      { name: "aceito", type: "checkbox", value: false },
      { name: "uf", type: "dropdown", value: "", options: ["SP", "RJ", "MG"] },
    ]);
  });

  it("preenche e persiste", async () => {
    const bytes = await makeFormPdf();
    const out = await fillForm(bytes, { nome: "João da Silva", aceito: true, uf: "MG" });
    const fields = await listFormFields(out);
    expect(fields.find((f) => f.name === "nome")?.value).toBe("João da Silva");
    expect(fields.find((f) => f.name === "aceito")?.value).toBe(true);
    expect(fields.find((f) => f.name === "uf")?.value).toBe("MG");
  });

  it("PDF sem formulário devolve lista vazia", async () => {
    expect(await listFormFields(await makePdf(1))).toEqual([]);
  });
});
