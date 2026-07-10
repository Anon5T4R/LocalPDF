// Tipos do documento e das anotações.
//
// Coordenadas de anotação: espaço do VIEWPORT do pdf.js em escala 1 —
// origem no canto superior esquerdo da página COMO EXIBIDA (já considera o
// /Rotate da página), y pra baixo, unidades = pontos PDF. Pra desenhar na tela
// basta multiplicar pela escala; pra "queimar" no PDF, `coords.ts` converte
// pro espaço do usuário do PDF (y pra cima, sem rotação).

export type Tool = "select" | "highlight" | "text" | "ink";

export interface HighlightAnnot {
  id: string;
  kind: "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface TextAnnot {
  id: string;
  kind: "text";
  x: number;
  y: number;
  size: number; // tamanho da fonte em pontos
  color: string;
  text: string;
}

export interface InkAnnot {
  id: string;
  kind: "ink";
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export type Annot = HighlightAnnot | TextAnnot | InkAnnot;

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
