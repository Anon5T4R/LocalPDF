import { describe, expect, it } from "vitest";
import { hexToRgb01, sanitizeWinAnsi, toPdfPoint, toPdfRect, viewportSize } from "../coords";

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
