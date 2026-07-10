// Assinatura desenhada à mão: canvas → PNG recortado no traço → carimbo na
// página (annot "image", queimado no PDF ao salvar). A última assinatura fica
// guardada no localStorage pra reutilizar.

import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

const SIG_KEY = "localpdf.signature";

/** Recorta o canvas no bounding box do traço; null se estiver vazio. */
function trimToDataUrl(canvas: HTMLCanvasElement): { dataUrl: string; aspect: number } | null {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/png"), aspect: h / w };
}

export default function SignatureModal(props: { onClose: () => void }) {
  const setPendingImage = useStore((s) => s.setPendingImage);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [hasStroke, setHasStroke] = useState(false);
  const [saved, setSaved] = useState<{ dataUrl: string; aspect: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(SIG_KEY) ?? "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    // o canvas pode estar esticado pelo CSS — converter pra coords internas
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* ok */
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasStroke(true);
  };
  const up = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasStroke(false);
  };

  const use = (sig: { dataUrl: string; aspect: number }) => {
    localStorage.setItem(SIG_KEY, JSON.stringify(sig));
    setPendingImage(sig);
    props.onClose();
  };

  const useDrawn = () => {
    const sig = trimToDataUrl(canvasRef.current!);
    if (sig) use(sig);
  };

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✍ Assinatura</h3>
        {saved && (
          <div className="sig-saved">
            <img src={saved.dataUrl} alt="assinatura salva" />
            <div className="sig-saved-actions">
              <button className="primary" onClick={() => use(saved)}>
                Usar a salva
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem(SIG_KEY);
                  setSaved(null);
                }}
              >
                🗑 Apagar
              </button>
            </div>
          </div>
        )}
        <p className="muted small">Desenhe abaixo (mouse ou caneta):</p>
        <canvas
          ref={canvasRef}
          className="sig-canvas"
          width={520}
          height={180}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
        />
        <div className="modal-actions">
          <button onClick={clear} disabled={!hasStroke}>
            Limpar
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={props.onClose}>Cancelar</button>
          <button className="primary" onClick={useDrawn} disabled={!hasStroke}>
            Usar → clique na página
          </button>
        </div>
      </div>
    </div>
  );
}
