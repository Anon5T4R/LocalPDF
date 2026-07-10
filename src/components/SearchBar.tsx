// Busca no documento (Ctrl+F): varre o texto posicionado (e as palavras do
// OCR em página escaneada), navega entre os acertos e pisca o trecho na página.

import { useCallback, useEffect, useRef, useState } from "react";
import { getPageItems } from "../lib/textcache";
import { useStore } from "../state/store";

interface Hit {
  page: number;
  rect: { x: number; y: number; w: number; h: number };
  snippet: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export default function SearchBar(props: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const docVersion = useStore((s) => s.docVersion);
  const ocrPages = useStore((s) => s.ocrPages);
  const setSearchFlash = useStore((s) => s.setSearchFlash);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);

  const clearFlash = useCallback(() => {
    window.clearTimeout(flashTimer.current);
    setSearchFlash(null);
  }, [setSearchFlash]);

  useEffect(() => () => clearFlash(), [clearFlash]);

  const goTo = useCallback(
    (list: Hit[], i: number) => {
      if (!list.length) return;
      const hit = list[((i % list.length) + list.length) % list.length];
      setIdx(((i % list.length) + list.length) % list.length);
      window.dispatchEvent(new CustomEvent("localpdf:scroll-to", { detail: hit.page }));
      window.clearTimeout(flashTimer.current);
      setSearchFlash({ page: hit.page, rects: [hit.rect] });
      flashTimer.current = window.setTimeout(() => setSearchFlash(null), 2600);
    },
    [setSearchFlash]
  );

  const search = useCallback(
    async (raw: string) => {
      const query = norm(raw.trim());
      const id = ++runId.current;
      clearFlash();
      setHits([]);
      setIdx(0);
      if (!doc || query.length < 2) return;
      setBusy(true);
      const found: Hit[] = [];
      for (let p = 0; p < doc.numPages; p++) {
        const items = await getPageItems(doc, docVersion, p);
        if (id !== runId.current) return; // busca mais nova em andamento
        let hadText = false;
        for (const it of items) {
          hadText = true;
          if (norm(it.str).includes(query)) {
            found.push({ page: p, rect: { x: it.x, y: it.y, w: it.w, h: it.h }, snippet: it.str.slice(0, 80) });
          }
        }
        // página sem texto: procura nas palavras do OCR (se houver)
        if (!hadText && ocrPages[p]) {
          for (const w of ocrPages[p].words) {
            if (norm(w.text).includes(query)) {
              found.push({ page: p, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, snippet: w.text });
            }
          }
        }
      }
      if (id !== runId.current) return;
      setHits(found);
      setBusy(false);
      if (found.length) goTo(found, 0);
    },
    [doc, docVersion, ocrPages, goTo, clearFlash]
  );

  // debounce da digitação
  useEffect(() => {
    const t = window.setTimeout(() => search(q), 300);
    return () => window.clearTimeout(t);
  }, [q, search]);

  return (
    <div className="searchbar">
      <input
        autoFocus
        type="text"
        placeholder="Buscar no documento…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") goTo(hits, e.shiftKey ? idx - 1 : idx + 1);
          if (e.key === "Escape") {
            clearFlash();
            props.onClose();
          }
        }}
      />
      <span className="search-count">
        {busy ? "…" : hits.length ? `${idx + 1}/${hits.length}` : q.trim().length >= 2 ? "0" : ""}
      </span>
      <button onClick={() => goTo(hits, idx - 1)} disabled={!hits.length} title="Anterior (Shift+Enter)">
        ↑
      </button>
      <button onClick={() => goTo(hits, idx + 1)} disabled={!hits.length} title="Próximo (Enter)">
        ↓
      </button>
      <button
        onClick={() => {
          clearFlash();
          props.onClose();
        }}
        title="Fechar (Esc)"
      >
        ×
      </button>
    </div>
  );
}
