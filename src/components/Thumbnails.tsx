import { memo, useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/pdfjs";
import { useStore } from "../state/store";
import { pickSavePath } from "./TopBar";

const THUMB_W = 132;

/** Miniatura de uma página (renderiza quando entra na viewport). */
const Thumb = memo(function Thumb(props: { index: number }) {
  const { index } = props;
  const doc = useStore((s) => s.doc);
  const docVersion = useStore((s) => s.docVersion);
  const vp = useStore((s) => s.vpSizes[index]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: el.closest(".thumbs"),
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !doc || !canvasRef.current || !vp) return;
    const scale = THUMB_W / vp.w;
    const r = renderPage(doc, index + 1, canvasRef.current, scale);
    return () => r.cancel();
  }, [visible, doc, docVersion, index, vp]);

  const h = vp ? Math.round((vp.h / vp.w) * THUMB_W) : THUMB_W;
  return (
    <div ref={wrapRef} className="thumb-canvas" style={{ width: THUMB_W, height: h }}>
      <canvas ref={canvasRef} />
    </div>
  );
});

export default function Thumbnails() {
  const pageCount = useStore((s) => s.vpSizes.length);
  const selected = useStore((s) => s.selected);
  const current = useStore((s) => s.current);
  const selectPage = useStore((s) => s.selectPage);
  const rotateSelected = useStore((s) => s.rotateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const extractSelected = useStore((s) => s.extractSelected);
  const movePages = useStore((s) => s.movePages);
  const busy = useStore((s) => s.busy);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragSrc = useRef<number[]>([]);

  const go = (i: number, e: React.MouseEvent) => {
    selectPage(i, e.ctrlKey || e.metaKey);
    window.dispatchEvent(new CustomEvent("localpdf:scroll-to", { detail: i }));
  };

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    dragSrc.current = selected.includes(i) ? selected : [i];
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropAt(i + (after ? 1 : 0));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropAt !== null && dragSrc.current.length) movePages(dragSrc.current, dropAt);
    setDropAt(null);
    dragSrc.current = [];
  };

  const doExtract = async () => {
    const path = await pickSavePath("paginas-extraidas.pdf");
    if (path) await extractSelected(path);
  };

  const nSel = selected.length || 1;

  return (
    <aside className="thumbs" onDrop={onDrop} onDragLeave={() => setDropAt(null)}>
      <div className="thumbs-list">
        {Array.from({ length: pageCount }, (_, i) => (
          <div
            key={i}
            className={
            "thumb" +
              (selected.includes(i) || (!selected.length && current === i) ? " selected" : "") +
              (dropAt === i ? " drop-before" : "") +
              (dropAt === i + 1 ? " drop-after" : "")
            }
            draggable={!busy}
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onClick={(e) => go(i, e)}
          >
            <Thumb index={i} />
            <div className="thumb-num">{i + 1}</div>
          </div>
        ))}
      </div>
      <div className="thumbs-tools">
        <button onClick={() => rotateSelected(-90)} disabled={!!busy} title={`Girar ${nSel} página(s) à esquerda`}>
          ⟲
        </button>
        <button onClick={() => rotateSelected(90)} disabled={!!busy} title={`Girar ${nSel} página(s) à direita`}>
          ⟳
        </button>
        <button onClick={doExtract} disabled={!!busy} title={`Extrair ${nSel} página(s) pra um novo PDF`}>
          ⇱
        </button>
        <button
          onClick={deleteSelected}
          disabled={!!busy || pageCount <= 1}
          title={`Excluir ${nSel} página(s)`}
        >
          🗑
        </button>
      </div>
    </aside>
  );
}
