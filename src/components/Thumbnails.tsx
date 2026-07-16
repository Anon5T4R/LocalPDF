import { memo, useEffect, useRef, useState } from "react";
import { documentOutline, renderPage, type OutlineEntry } from "../lib/pdfjs";
import { useStore } from "../state/store";
import { t as tr } from "../lib/i18n";
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

  return (
    <div
      ref={wrapRef}
      className="thumb-canvas"
      style={{ aspectRatio: vp ? `${vp.w} / ${vp.h}` : "3 / 4" }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
});

/** Aba de sumário (capítulos do PDF, quando o documento tem outline). */
function TocList() {
  const doc = useStore((s) => s.doc);
  const docVersion = useStore((s) => s.docVersion);
  const current = useStore((s) => s.current);
  const selectPage = useStore((s) => s.selectPage);
  const [toc, setToc] = useState<OutlineEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setToc(null);
    if (!doc) return;
    documentOutline(doc).then((t) => {
      if (!cancelled) setToc(t);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, docVersion]);

  const go = (e: OutlineEntry) => {
    if (e.pageIndex < 0) return;
    selectPage(e.pageIndex, false);
    window.dispatchEvent(new CustomEvent("localpdf:scroll-to", { detail: e.pageIndex }));
  };

  if (!toc) return <div className="toc-empty muted small">{tr("thumb.tocLoading")}</div>;
  if (!toc.length) return <div className="toc-empty muted small">{tr("thumb.tocEmpty")}</div>;
  return (
    <div className="toc-list">
      {toc.map((e, i) => (
        <button
          key={i}
          className={`toc-item ${e.pageIndex === current ? "active" : ""}`}
          style={{ paddingLeft: 10 + e.level * 14 }}
          onClick={() => go(e)}
          disabled={e.pageIndex < 0}
          title={e.pageIndex >= 0 ? tr("thumb.tocPage", { n: e.pageIndex + 1 }) : tr("thumb.tocUnavailable")}
        >
          <span className="toc-title">{e.title}</span>
          {e.pageIndex >= 0 && <span className="toc-page">{e.pageIndex + 1}</span>}
        </button>
      ))}
    </div>
  );
}

export default function Thumbnails() {
  const pageCount = useStore((s) => s.vpSizes.length);
  const selected = useStore((s) => s.selected);
  const current = useStore((s) => s.current);
  const selectPage = useStore((s) => s.selectPage);
  const rotateSelected = useStore((s) => s.rotateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const extractSelected = useStore((s) => s.extractSelected);
  const insertBlankAfter = useStore((s) => s.insertBlankAfter);
  const movePages = useStore((s) => s.movePages);
  const busy = useStore((s) => s.busy);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [tab, setTab] = useState<"pages" | "toc">("pages");
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
    const path = await pickSavePath(tr("thumb.extractName"));
    if (path) await extractSelected(path);
  };

  const nSel = selected.length || 1;

  return (
    <aside className="thumbs" onDrop={onDrop} onDragLeave={() => setDropAt(null)}>
      <div className="thumbs-tabs">
        <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>
          {tr("thumb.tabPages")}
        </button>
        <button className={tab === "toc" ? "active" : ""} onClick={() => setTab("toc")}>
          {tr("thumb.tabToc")}
        </button>
      </div>
      {tab === "toc" ? (
        <TocList />
      ) : (
        <>
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
        <button onClick={() => rotateSelected(-90)} disabled={!!busy} title={tr("thumb.rotateLeft", { n: nSel })}>
          ⟲
        </button>
        <button onClick={() => rotateSelected(90)} disabled={!!busy} title={tr("thumb.rotateRight", { n: nSel })}>
          ⟳
        </button>
        <button onClick={doExtract} disabled={!!busy} title={tr("thumb.extract", { n: nSel })}>
          ⇱
        </button>
        <button
          onClick={() => insertBlankAfter(selected.length ? Math.max(...selected) : current)}
          disabled={!!busy}
          title={tr("thumb.insertBlank")}
        >
          ＋
        </button>
        <button
          onClick={deleteSelected}
          disabled={!!busy || pageCount <= 1}
          title={tr("thumb.delete", { n: nSel })}
        >
          🗑
        </button>
      </div>
        </>
      )}
    </aside>
  );
}
