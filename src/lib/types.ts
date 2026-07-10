// Tipos do documento e das anotações.
//
// Coordenadas de anotação: espaço do VIEWPORT do pdf.js em escala 1 —
// origem no canto superior esquerdo da página COMO EXIBIDA (já considera o
// /Rotate da página), y pra baixo, unidades = pontos PDF. Pra desenhar na tela
// basta multiplicar pela escala; pra "queimar" no PDF, `coords.ts` converte
// pro espaço do usuário do PDF (y pra cima, sem rotação).

export type Tool = "select" | "highlight" | "text" | "ink" | "edittext";

export interface HighlightAnnot {
  id: string;
  kind: "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** Famílias padrão do PDF (não precisam ser embutidas — existem em todo leitor). */
export type PdfFont = "helvetica" | "times" | "courier";

export const FONT_CSS: Record<PdfFont, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
};

export interface TextAnnot {
  id: string;
  kind: "text";
  x: number;
  y: number;
  size: number; // tamanho da fonte em pontos
  color: string;
  text: string;
  /** default: helvetica (annots antigas não têm o campo) */
  font?: PdfFont;
}

export interface InkAnnot {
  id: string;
  kind: "ink";
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

/** Imagem carimbada na página (assinatura, logo, carimbo) — PNG/JPEG em dataURL. */
export interface ImageAnnot {
  id: string;
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
}

/** Tarja sólida (cobre o conteúdo original — base da edição de texto de linha). */
export interface RedactAnnot {
  id: string;
  kind: "redact";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export type Annot = HighlightAnnot | TextAnnot | InkAnnot | ImageAnnot | RedactAnnot;

/** Palavra reconhecida pelo OCR, em coords do viewport escala 1. */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

/** Imagem aguardando o clique que a posiciona na página (assinatura/carimbo). */
export interface PendingImage {
  dataUrl: string;
  /** proporção natural altura/largura (pra dimensionar no clique) */
  aspect: number;
}

/** Anotações pendentes (ainda não queimadas no PDF), por índice de página. */
export type AnnotMap = Record<number, Annot[]>;

export interface FieldInfo {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "option-list" | "other";
  value: string | boolean;
  options?: string[]; // radio/dropdown
  multiline?: boolean;
}

let seq = 0;
export const newId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;
