// Conversão entre o espaço do viewport do pdf.js (escala 1, y pra baixo, com a
// rotação da página aplicada) e o espaço do usuário do PDF (y pra cima, sem
// rotação) — é onde o pdf-lib desenha.
//
// Derivado da matriz que o PageViewport do pdf.js monta pra cada rotação
// (viewBox [0,0,W,H], escala 1, sem offset):
//   r=0:   vx = px      ; vy = H - py
//   r=90:  vx = py      ; vy = px        (viewport fica H de largura, W de altura)
//   r=180: vx = W - px  ; vy = py
//   r=270: vx = H - py  ; vy = W - px

export interface PageGeom {
  /** Largura/altura do MediaBox em pontos (como o pdf-lib reporta em getSize). */
  w: number;
  h: number;
  /** /Rotate normalizado: 0 | 90 | 180 | 270. */
  rotation: number;
}

export const normalizeRotation = (r: number) => (((r % 360) + 360) % 360) as 0 | 90 | 180 | 270;

/** Dimensões do viewport (escala 1) de uma página com essa geometria. */
export function viewportSize(g: PageGeom): { w: number; h: number } {
  const r = normalizeRotation(g.rotation);
  return r === 90 || r === 270 ? { w: g.h, h: g.w } : { w: g.w, h: g.h };
}

/** Ponto do viewport (escala 1) → ponto no espaço do usuário do PDF. */
export function toPdfPoint(g: PageGeom, vx: number, vy: number): { x: number; y: number } {
  switch (normalizeRotation(g.rotation)) {
    case 0:
      return { x: vx, y: g.h - vy };
    case 90:
      return { x: vy, y: vx };
    case 180:
      return { x: g.w - vx, y: vy };
    case 270:
      return { x: g.w - vy, y: g.h - vx };
  }
}

/** Retângulo do viewport → retângulo PDF (x,y = canto inferior esquerdo, y pra cima). */
export function toPdfRect(
  g: PageGeom,
  vx: number,
  vy: number,
  vw: number,
  vh: number
): { x: number; y: number; w: number; h: number } {
  const a = toPdfPoint(g, vx, vy);
  const b = toPdfPoint(g, vx + vw, vy + vh);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** #rrggbb → componentes 0..1 (pro rgb() do pdf-lib). */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

// Mapa dos "tipográficos" comuns fora do latin-1 que o WinAnsi das fontes
// padrão do PDF SABE desenhar — mantidos como estão. O resto acima de 0xFF
// vira "?" pra fonte padrão (Helvetica) não estourar na hora de queimar.
const WINANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ" +
    "‘’“”•–—˜™š›œžŸ"
);

/** Garante que o texto seja codificável em WinAnsi (fontes padrão do pdf-lib). */
export function sanitizeWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t" || (cp >= 32 && cp <= 255 && cp !== 127) || WINANSI_EXTRA.has(ch)) {
      out += ch === "\t" ? "  " : ch;
    } else if (cp === 13) {
      // \r\n vira \n
    } else {
      out += "?";
    }
  }
  return out;
}
