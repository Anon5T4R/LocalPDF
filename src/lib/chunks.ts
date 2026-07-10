// Chunking + recuperação lexical do texto do PDF pra IA (Q&A).
// RAG "de pobre" por enquanto: ranking por sobreposição de termos, sem
// embeddings — o índice com embeddings do llama.cpp é o upgrade planejado
// (módulo comum da suíte, projetos.md §6.2).

export interface Chunk {
  page: number; // 0-based
  text: string;
}

/** Quebra o texto das páginas em chunks de ~`target` chars (nunca corta página no meio de palavra). */
export function chunkPages(pages: string[], target = 1200): Chunk[] {
  const out: Chunk[] = [];
  pages.forEach((raw, page) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (text.length <= target * 1.5) {
      out.push({ page, text });
      return;
    }
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + target, text.length);
      if (end < text.length) {
        const sp = text.lastIndexOf(" ", end);
        if (sp > start + target / 2) end = sp;
      }
      out.push({ page, text: text.slice(start, end).trim() });
      start = end;
    }
  });
  return out;
}

const STOP = new Set(
  ("a o e de da do das dos em no na nos nas um uma que com por para pra se é são ao aos à às foi ser tem seu sua " +
    "the of and to in is a an for on it as at by this that").split(" ")
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Pontua um chunk pela sobreposição de termos com a pergunta. */
export function scoreChunk(queryTokens: string[], chunk: Chunk): number {
  if (!queryTokens.length) return 0;
  const text = tokenize(chunk.text);
  const bag = new Map<string, number>();
  for (const t of text) bag.set(t, (bag.get(t) ?? 0) + 1);
  let score = 0;
  for (const q of new Set(queryTokens)) {
    const n = bag.get(q) ?? 0;
    if (n > 0) score += (1 + Math.log(n)) * q.length;
  }
  return score;
}

/** Melhores chunks pra pergunta, dentro de um orçamento de caracteres. */
export function topChunks(query: string, chunks: Chunk[], budgetChars = 6000): Chunk[] {
  const q = tokenize(query);
  const ranked = chunks
    .map((c) => ({ c, s: scoreChunk(q, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const picked: Chunk[] = [];
  let used = 0;
  for (const { c } of ranked) {
    if (used + c.text.length > budgetChars) continue;
    picked.push(c);
    used += c.text.length;
    if (used > budgetChars * 0.9) break;
  }
  // sem match nenhum: manda o começo do documento (perguntas genéricas)
  if (!picked.length) {
    for (const c of chunks) {
      if (used + c.text.length > budgetChars) break;
      picked.push(c);
      used += c.text.length;
    }
  }
  return picked.sort((a, b) => a.page - b.page);
}
