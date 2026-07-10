import { describe, expect, it } from "vitest";
import {
  fromPdfPoint,
  hexToRgb01,
  remapRect,
  rotateAnnots,
  sanitizeWinAnsi,
  toPdfPoint,
  toPdfRect,
  viewportSize,
} from "../coords";
import type { HighlightAnnot, InkAnnot } from "../types";

// página A4 retrato: 595 x 842 pontos
const g = (rotation: number) => ({ w: 595, h: 842, rotation });

describe("viewportSize", () => {
  it("mantém dimensões em 0/180 e troca em 90/270", () => {
    expect(viewportSize(g(0))).toEqual({ w: 595, h: 842 });
    expect(viewportSize(g(180))).toEqual({ w: 595, h: 842 });
    expect(viewportSize(g(90))).toEqual({ w: 842, h: 595 });
    expect(viewportSize(g(270))).toEqual({ w: 842, h: 595 });
    expect(viewportSize(g(-90))).toEqual({ w: 842, h: 595 }); // normaliza
  });
});

describe("toPdfPoint (inverso da matriz do PageViewport do pdf.js)", () => {
  it("r=0: canto superior esquerdo do viewport = (0, H) no PDF", () => {
    expect(toPdfPoint(g(0), 0, 0)).toEqual({ x: 0, y: 842 });
    expect(toPdfPoint(g(0), 10, 20)).toEqual({ x: 10, y: 822 });
  });
  it("r=90: vx=py, vy=px", () => {
    // viewport (vx,vy) -> pdf (px,py) com px=vy, py=vx
    expect(toPdfPoint(g(90), 30, 40)).toEqual({ x: 40, y: 30 });
    // origem do viewport = origem do PDF
    expect(toPdfPoint(g(90), 0, 0)).toEqual({ x: 0, y: 0 });
  });
  it("r=180: espelha x", () => {
    expect(toPdfPoint(g(180), 0, 0)).toEqual({ x: 595, y: 0 });
    expect(toPdfPoint(g(180), 10, 20)).toEqual({ x: 585, y: 20 });
  });
  it("r=270: px=W-vy, py=H-vx", () => {
    expect(toPdfPoint(g(270), 0, 0)).toEqual({ x: 595, y: 842 });
    expect(toPdfPoint(g(270), 30, 40)).toEqual({ x: 555, y: 812 });
  });
  it("ida e volta: os 4 cantos do viewport caem dentro do MediaBox", () => {
    for (const r of [0, 90, 180, 270]) {
      const geo = g(r);
      const vs = viewportSize(geo);
      for (const [vx, vy] of [
        [0, 0],
        [vs.w, 0],
        [0, vs.h],
        [vs.w, vs.h],
      ]) {
        const p = toPdfPoint(geo, vx, vy);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(geo.w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(geo.h);
      }
    }
  });
});

describe("fromPdfPoint / remap / rotateAnnots", () => {
  it("fromPdfPoint é o inverso exato de toPdfPoint nas 4 rotações", () => {
    for (const r of [0, 90, 180, 270]) {
      const geo = g(r);
      for (const [vx, vy] of [
        [0, 0],
        [123.5, 45.25],
        [400, 700],
      ]) {
        const p = toPdfPoint(geo, vx, vy);
        const back = fromPdfPoint(geo, p.x, p.y);
        expect(back.x).toBeCloseTo(vx, 6);
        expect(back.y).toBeCloseTo(vy, 6);
      }
    }
  });

  it("remapRect: girar 0→90 leva o retângulo pro mesmo lugar físico", () => {
    // retângulo no topo esquerdo em retrato; após girar 90 a página exibida
    // deita e o mesmo trecho físico fica no canto superior direito
    const r = remapRect(g(0), g(90), { x: 10, y: 20, w: 100, h: 30 });
    // volta: remap inverso recupera o original
    const back = remapRect(g(90), g(0), r);
    expect(back.x).toBeCloseTo(10);
    expect(back.y).toBeCloseTo(20);
    expect(back.w).toBeCloseTo(100);
    expect(back.h).toBeCloseTo(30);
    // dimensões trocam de eixo no 90
    expect(r.w).toBeCloseTo(30);
    expect(r.h).toBeCloseTo(100);
  });

  it("rotateAnnots segue realce e tinta; ida e volta restaura", () => {
    const hl: HighlightAnnot = { id: "h", kind: "highlight", x: 50, y: 60, w: 80, h: 20, color: "#facc15" };
    const ink: InkAnnot = {
      id: "i",
      kind: "ink",
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 90 },
      ],
      color: "#f87171",
      width: 2,
    };
    const once = rotateAnnots([hl, ink], g(0), 90);
    const back = rotateAnnots(once, g(90), -90);
    const hlBack = back[0] as HighlightAnnot;
    expect(hlBack.x).toBeCloseTo(50);
    expect(hlBack.y).toBeCloseTo(60);
    expect(hlBack.w).toBeCloseTo(80);
    expect(hlBack.h).toBeCloseTo(20);
    const inkBack = back[1] as InkAnnot;
    expect(inkBack.points[1].x).toBeCloseTo(40);
    expect(inkBack.points[1].y).toBeCloseTo(90);
  });

  it("rotateAnnots mantém as coords dentro do viewport novo", () => {
    const hl: HighlightAnnot = { id: "h", kind: "highlight", x: 500, y: 800, w: 50, h: 20, color: "#fff000" };
    const [r] = rotateAnnots([hl], g(0), 90) as HighlightAnnot[];
    const vs = viewportSize(g(90));
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(vs.w + 0.001);
    expect(r.y + r.h).toBeLessThanOrEqual(vs.h + 0.001);
  });
});

describe("toPdfRect", () => {
  it("r=0: y vira distância do rodapé", () => {
    // retângulo 100x50 no topo esquerdo do viewport
    expect(toPdfRect(g(0), 10, 20, 100, 50)).toEqual({ x: 10, y: 842 - 70, w: 100, h: 50 });
  });
  it("r=90: w/h trocam", () => {
    const r = toPdfRect(g(90), 10, 20, 100, 50);
    expect(r.w).toBe(50);
    expect(r.h).toBe(100);
  });
  it("nunca devolve dimensões negativas", () => {
    for (const rot of [0, 90, 180, 270]) {
      const r = toPdfRect(g(rot), 5, 6, 70, 80);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });
});

describe("sanitizeWinAnsi", () => {
  it("preserva acentos do português (latin-1)", () => {
    expect(sanitizeWinAnsi("ação café àéîõü ÇÃO")).toBe("ação café àéîõü ÇÃO");
  });
  it("preserva tipográficos que o WinAnsi tem (aspas curvas, travessão, €)", () => {
    expect(sanitizeWinAnsi("“ok” — vale €5…")).toBe("“ok” — vale €5…");
  });
  it("troca o que a fonte padrão não desenha por ?", () => {
    expect(sanitizeWinAnsi("中文 → ok")).toBe("?? ? ok");
  });
  it("mantém quebras de linha e expande tab", () => {
    expect(sanitizeWinAnsi("a\nb\tc\r\nd")).toBe("a\nb  c\nd");
  });
});

describe("hexToRgb01", () => {
  it("converte #rrggbb", () => {
    expect(hexToRgb01("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb01("00ff00")).toEqual({ r: 0, g: 1, b: 0 });
  });
  it("inválido cai em preto", () => {
    expect(hexToRgb01("banana")).toEqual({ r: 0, g: 0, b: 0 });
  });
});
