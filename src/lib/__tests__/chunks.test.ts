import { describe, expect, it } from "vitest";
import { chunkPages, topChunks, tokenize } from "../chunks";

describe("chunkPages", () => {
  it("página curta vira um chunk", () => {
    const c = chunkPages(["olá mundo", "", "segunda página"]);
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ page: 0, text: "olá mundo" });
    expect(c[1].page).toBe(2);
  });
  it("página longa é quebrada sem cortar palavras", () => {
    const long = Array.from({ length: 400 }, (_, i) => `palavra${i}`).join(" ");
    const c = chunkPages([long], 500);
    expect(c.length).toBeGreaterThan(1);
    for (const chunk of c) {
      expect(chunk.page).toBe(0);
      // cada pedaço termina em palavra completa
      expect(long).toContain(chunk.text);
    }
  });
});

describe("tokenize", () => {
  it("normaliza acentos, caixa e remove stopwords", () => {
    expect(tokenize("A Manutenção DO equipamento")).toEqual(["manutencao", "equipamento"]);
  });
});

describe("topChunks", () => {
  const chunks = [
    { page: 0, text: "Este contrato rege a prestação de serviços de limpeza." },
    { page: 1, text: "O pagamento será feito todo dia cinco de cada mês." },
    { page: 2, text: "A rescisão exige aviso prévio de trinta dias." },
  ];
  it("acha o chunk relevante pra pergunta", () => {
    const picked = topChunks("qual o prazo de aviso prévio para rescisão?", chunks);
    expect(picked[0].page).toBe(2);
  });
  it("pergunta sem match cai no começo do documento", () => {
    const picked = topChunks("xyzabc", chunks, 200);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked[0].page).toBe(0);
  });
  it("respeita o orçamento de caracteres", () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ page: i, text: "pagamento ".repeat(100) }));
    const picked = topChunks("pagamento", big, 3000);
    expect(picked.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(3000);
  });
});
