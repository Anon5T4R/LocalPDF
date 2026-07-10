import { memo, useCallback, useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/pdfjs";
import { useStore } from "../state/store";
import { newId, type Annot, type TextAnnot } from "../lib/types";

// ---------------------------------------------------------------------------
// camada de anotações de uma página (coords no espaço do viewport escala 1)
// ---------------------------------------------------------------------------

// referência estável pra página sem anotações (selector do zustand não pode
// devolver `[]` novo a cada render — loop infinito de getSnapshot)
const NO_ANNOTS: Annot[] = [];

function AnnotLayer(props: { index: number; scale: number }) {
  const { index, scale } = props;
  const tool = useStore((s) => s.tool);
  const color = useStore((s) => s.color);
  const fontSize = useStore((s) => s.fontSize);
  const strokeWidth = useStore((s) => s.strokeWidth);
  const annots = useStore((s) => s.annots[index] ?? NO_ANNOTS);
  const selectedAnnot = useStore((s) => s.selectedAnnot);
  const addAnnot = useStore((s) => s.addAnnot);
  const updateAnnot = useStore((s) => s.updateAnnot);
  const removeAnnot = useStore((s) => s.removeAnnot);
  const setSelectedAnnot = useStore((s) => s.setSelectedAnnot);

  const ref = useRef<HTMLDivElement>(null);
  const [rubber, setRubber] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [inkPts, setInkPts] = useState<{ x: number; y: number }[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const moveRef = useRef<{ id: string; last: { x: number; y: number } } | null>(null);

  const toV = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const r = ref.current!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    },
    [scale]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toV(e);
    if (tool === "highlight") {
      setRubber({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool === "ink") {
      setInkPts([p]);
    } else if (tool === "text") {
      const a: TextAnnot = { id: newId(), kind: "text", x: p.x, y: p.y, size: fontSize, color, text: "" };
      addAnnot(index, a);
      setEditing(a.id);
      setSelectedAnnot({ page: index, id: a.id });
      return; // sem captura: o textarea assume o foco
    } else {
      // select: clique no vazio limpa a seleção (clique em annot é tratado no elemento)
      setSelectedAnnot(null);
      return;
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro já solto */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (rubber) {
      const p = toV(e);
      setRubber({ ...rubber, x1: p.x, y1: p.y });
    } else if (inkPts) {
      const p = toV(e);
      setInkPts((pts) => (pts ? [...pts, p] : pts));
    } else if (moveRef.current) {
      const p = toV(e);
      const m = moveRef.current;
      const dx = p.x - m.last.x;
      const dy = p.y - m.last.y;
      m.last = p;
      const a = (useStore.getState().annots[index] ?? []).find((x) => x.id === m.id);
      if (!a) return;
      if (a.kind === "ink") {
        updateAnnot(index, { ...a, points: a.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) });
      } else {
        updateAnnot(index, { ...a, x: a.x + dx, y: a.y + dy } as Annot);
      }
    }
  };

  const onPointerUp = () => {
    if (rubber) {
      const x = Math.min(rubber.x0, rubber.x1);
      const y = Math.min(rubber.y0, rubber.y1);
      const w = Math.abs(rubber.x1 - rubber.x0);
      const h = Math.abs(rubber.y1 - rubber.y0);
      if (w > 3 && h > 3) addAnnot(index, { id: newId(), kind: "highlight", x, y, w, h, color });
      setRubber(null);
    }
    if (inkPts) {
      if (inkPts.length > 1)
        addAnnot(index, { id: newId(), kind: "ink", points: inkPts, color, width: strokeWidth });
      setInkPts(null);
    }
    moveRef.current = null;
  };

  const grabAnnot = (a: Annot) => (e: React.PointerEvent) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    setSelectedAnnot({ page: index, id: a.id });
    moveRef.current = { id: a.id, last: toV(e) };
    try {
      (e.currentTarget.closest(".annot-layer") as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro já solto */
    }
  };

  const commitText = (a: TextAnnot, text: string) => {
    setEditing(null);
    if (!text.trim()) removeAnnot(index, a.id);
    else updateAnnot(index, { ...a, text });
  };

  const px = (v: number) => v * scale;
  const cursor =
    tool === "highlight" || tool === "ink" ? "crosshair" : tool === "text" ? "text" : "default";

  return (
    <div
      ref={ref}
      className="annot-layer"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {annots.map((a) => {
        const isSel = selectedAnnot?.page === index && selectedAnnot.id === a.id;
        if (a.kind === "highlight") {
          return (
            <div
              key={a.id}
              className={`an-highlight ${isSel ? "an-sel" : ""}`}
              style={{ left: px(a.x), top: px(a.y), width: px(a.w), height: px(a.h), background: a.color }}
              onPointerDown={grabAnnot(a)}
            />
          );
        }
        if (a.kind === "ink") {
          return (
            <svg key={a.id} className="an-ink" width="100%" height="100%">
              <polyline
                points={a.points.map((p) => `${px(p.x)},${px(p.y)}`).join(" ")}
                fill="none"
                stroke={a.color}
                strokeWidth={px(a.width)}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isSel ? "an-sel-stroke" : ""}
                style={{ pointerEvents: "stroke" }}
                onPointerDown={grabAnnot(a) as unknown as React.PointerEventHandler<SVGPolylineElement>}
              />
            </svg>
          );
        }
        // text
        if (editing === a.id) {
          return (
            <textarea
              key={a.id}
              className="an-text-edit"
              style={{ left: px(a.x), top: px(a.y), fontSize: px(a.size), color: a.color }}
              defaultValue={a.text}
              autoFocus
              onBlur={(e) => commitText(a, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                e.stopPropagation();
              }}
            />
          );
        }
        return (
          <div
            key={a.id}
            className={`an-text ${isSel ? "an-sel" : ""}`}
            style={{ left: px(a.x), top: px(a.y), fontSize: px(a.size), color: a.color }}
            onPointerDown={grabAnnot(a)}
            onDoubleClick={() => tool === "select" && setEditing(a.id)}
          >
            {a.text}
          </div>
        );
      })}
      {rubber && (
        <div
          className="an-rubber"
          style={{
            left: px(Math.min(rubber.x0, rubber.x1)),
            top: px(Math.min(rubber.y0, rubber.y1)),
            width: px(Math.abs(rubber.x1 - rubber.x0)),
            height: px(Math.abs(rubber.y1 - rubber.y0)),
            background: color,
          }}
        />
      )}
      {inkPts && inkPts.length > 1 && (
        <svg className="an-ink" width="100%" height="100%">
          <polyline
            points={inkPts.map((p) => `${px(p.x)},${px(p.y)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={px(strokeWidth)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// uma página: canvas (render preguiçoso) + camada de anotações
// ---------------------------------------------------------------------------

const PageView = memo(function PageView(props: { index: number; scale: number }) {
  const { index, scale } = props;
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
      root: el.closest(".viewer"),
      rootMargin: "800px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !doc || !canvasRef.current) return;
    const r = renderPage(doc, index + 1, canvasRef.current, scale);
    r.promise.catch(() => {});
    return () => r.cancel();
  }, [visible, doc, docVersion, index, scale]);

  if (!vp) return null;
  const w = Math.floor(vp.w * scale);
  const h = Math.floor(vp.h * scale);
  return (
    <div ref={wrapRef} className="page" data-page={index} style={{ width: w, height: h }}>
      <canvas ref={canvasRef} />
      <AnnotLayer index={index} scale={scale} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// o viewer: rolagem vertical de todas as páginas
// ---------------------------------------------------------------------------

export default function Viewer() {
  const pageCount = useStore((s) => s.vpSizes.length);
  const vpSizes = useStore((s) => s.vpSizes);
  const zoom = useStore((s) => s.zoom);
  const setCurrent = useStore((s) => s.setCurrent);
  const ref = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  // "ajustar à largura": maior página cabe no container
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const maxW = Math.max(1, ...vpSizes.map((v) => v.w));
      setFitScale(Math.max(0.1, (el.clientWidth - 48) / maxW));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vpSizes]);

  const scale = zoom === "fit" ? fitScale : zoom;

  // página atual = a mais próxima do meio da janela de rolagem
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    el.querySelectorAll<HTMLElement>(".page").forEach((p) => {
      const center = p.offsetTop + p.offsetHeight / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) {
        bestDist = d;
        best = Number(p.dataset.page);
      }
    });
    setCurrent(best);
  };

  // navegação vinda das miniaturas
  useEffect(() => {
    const onGo = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      const el = ref.current?.querySelector<HTMLElement>(`.page[data-page="${i}"]`);
      el?.scrollIntoView({ block: "start", behavior: "auto" });
    };
    window.addEventListener("localpdf:scroll-to", onGo);
    return () => window.removeEventListener("localpdf:scroll-to", onGo);
  }, []);

  return (
    <div ref={ref} className="viewer" onScroll={onScroll}>
      <div className="pages">
        {Array.from({ length: pageCount }, (_, i) => (
          <PageView key={i} index={i} scale={scale} />
        ))}
      </div>
    </div>
  );
}
