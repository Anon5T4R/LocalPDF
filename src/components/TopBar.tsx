import { useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readFileBytes } from "../lib/backend";
import { cycleTheme, getThemePref, type ThemePref } from "../lib/theme";
import { useStore } from "../state/store";
import type { SidePanel } from "../App";
import type { Annot, PdfFont, Tool } from "../lib/types";
import SignatureModal from "./SignatureModal";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "select", icon: "🖱", label: "Selecionar / mover — selecione texto e copie ou realce" },
  { id: "highlight", icon: "🖍", label: "Realçar (arraste um retângulo)" },
  { id: "text", icon: "🅣", label: "Caixa de texto (clique na página)" },
  { id: "ink", icon: "✏", label: "Desenho à mão livre" },
  { id: "edittext", icon: "✎", label: "Editar texto existente (beta) — clique numa linha" },
];

const COLORS = ["#facc15", "#4ade80", "#60a5fa", "#f87171", "#111111"];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const FONTS: { id: PdfFont; label: string }[] = [
  { id: "helvetica", label: "Helvetica" },
  { id: "times", label: "Times" },
  { id: "courier", label: "Courier" },
];
const THEME_ICON: Record<ThemePref, string> = { system: "🌓", light: "☀", dark: "🌙" };
const THEME_LABEL: Record<ThemePref, string> = { system: "sistema", light: "claro", dark: "escuro" };

export default function TopBar(props: {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSearch: () => void;
  panel: SidePanel;
  setPanel: (p: SidePanel) => void;
}) {
  const doc = useStore((s) => s.doc);
  const filePath = useStore((s) => s.filePath);
  const dirty = useStore((s) => s.dirty);
  const busy = useStore((s) => s.busy);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const current = useStore((s) => s.current);
  const pageCount = useStore((s) => s.vpSizes.length);
  const mergeWith = useStore((s) => s.mergeWith);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const strokeWidth = useStore((s) => s.strokeWidth);
  const setStrokeWidth = useStore((s) => s.setStrokeWidth);
  const pendingImage = useStore((s) => s.pendingImage);
  const setPendingImage = useStore((s) => s.setPendingImage);
  const font = useStore((s) => s.font);
  const setFont = useStore((s) => s.setFont);
  // anotação selecionada (pra cor/fonte/tamanho agirem sobre ela e refletirem seus valores)
  const selectedKind = useStore((s) => {
    const sa = s.selectedAnnot;
    if (!sa) return null;
    return (s.annots[sa.page] ?? []).find((a) => a.id === sa.id)?.kind ?? null;
  });
  const selectedFont = useStore((s) => {
    const sa = s.selectedAnnot;
    if (!sa) return null;
    const a = (s.annots[sa.page] ?? []).find((x) => x.id === sa.id);
    return a?.kind === "text" ? (a.font ?? "helvetica") : null;
  });
  const selectedSize = useStore((s) => {
    const sa = s.selectedAnnot;
    if (!sa) return null;
    const a = (s.annots[sa.page] ?? []).find((x) => x.id === sa.id);
    return a?.kind === "text" ? a.size : a?.kind === "ink" ? a.width : null;
  });
  const [sigOpen, setSigOpen] = useState(false);
  const [pageInput, setPageInput] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePref>(getThemePref);

  const zoomNum = typeof zoom === "number" ? zoom : null;
  const bumpZoom = (dir: 1 | -1) => {
    const cur = zoomNum ?? 1;
    const next = Math.min(4, Math.max(0.25, Math.round((cur + dir * 0.1) * 100) / 100));
    setZoom(next);
  };

  const doMerge = async () => {
    const picked = await openDialog({ filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (typeof picked === "string") await mergeWith(picked);
  };

  const doInsertImage = async () => {
    const picked = await openDialog({
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof picked !== "string") return;
    const bytes = await readFileBytes(picked);
    const mime = picked.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    const dataUrl = `data:${mime};base64,${btoa(bin)}`;
    const img = new Image();
    img.onload = () => setPendingImage({ dataUrl, aspect: img.naturalHeight / img.naturalWidth || 1 });
    img.src = dataUrl;
  };

  /** Aplica um patch na anotação selecionada (com undo próprio). */
  const applyToSelected = (patch: (a: Annot) => Annot | null) => {
    const s = useStore.getState();
    if (!s.selectedAnnot) return;
    const a = (s.annots[s.selectedAnnot.page] ?? []).find((x) => x.id === s.selectedAnnot!.id);
    if (!a) return;
    const next = patch(a);
    if (!next) return;
    s.beginAnnotTx();
    s.updateAnnot(s.selectedAnnot.page, next);
  };

  const pickColor = (c: string) => {
    setColor(c);
    applyToSelected((a) => ("color" in a && a.kind !== "redact" ? ({ ...a, color: c } as Annot) : null));
  };
  const pickFontSize = (n: number) => {
    setFontSize(n);
    applyToSelected((a) => (a.kind === "text" ? { ...a, size: n } : null));
  };
  const pickFont = (f: PdfFont) => {
    setFont(f);
    applyToSelected((a) => (a.kind === "text" ? { ...a, font: f } : null));
  };
  const pickStroke = (n: number) => {
    setStrokeWidth(n);
    applyToSelected((a) => (a.kind === "ink" ? { ...a, width: n } : null));
  };

  const goToPage = (raw: string) => {
    setPageInput(null);
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    const i = Math.max(0, Math.min(pageCount - 1, n - 1));
    window.dispatchEvent(new CustomEvent("localpdf:scroll-to", { detail: i }));
  };

  const fileName = filePath ? filePath.replace(/^.*[\\/]/, "") : "";

  return (
    <header className="topbar">
      <div className="tb-row">
        <button onClick={props.onOpen} title="Abrir PDF (Ctrl+O)">
          📂<span className="lbl"> Abrir</span>
        </button>
        <button onClick={props.onSave} disabled={!doc || !!busy} title="Salvar (Ctrl+S) — grava as anotações no PDF">
          💾<span className="lbl"> Salvar</span>
        </button>
        <button onClick={props.onSaveAs} disabled={!doc || !!busy} title="Salvar como (Ctrl+Shift+S)">
          💾<span className="lbl"> Salvar como</span><span className="lbl-mini">…</span>
        </button>
        <button onClick={doMerge} disabled={!doc || !!busy} title="Acrescentar as páginas de outro PDF ao fim">
          ➕<span className="lbl"> Mesclar</span>
        </button>
        <span className="tb-sep" />
        <button onClick={undo} disabled={!canUndo || !!busy} title="Desfazer (Ctrl+Z)">
          ↩
        </button>
        <button onClick={redo} disabled={!canRedo || !!busy} title="Refazer (Ctrl+Y)">
          ↪
        </button>

        <span className="tb-file" title={filePath ?? ""}>
          {fileName}
          {dirty && <span className="tb-dirty" title="Alterações não salvas" />}
        </span>

        {doc && (
          <span className="tb-right">
            <button onClick={props.onSearch} title="Buscar no documento (Ctrl+F)">
              🔎
            </button>
            {pageInput !== null ? (
              <input
                className="tb-page-input"
                autoFocus
                defaultValue={pageInput}
                onBlur={(e) => goToPage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToPage((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setPageInput(null);
                }}
              />
            ) : (
              <button className="tb-page" onClick={() => setPageInput(String(current + 1))} title="Ir para a página…">
                p. {Math.min(current + 1, pageCount)} / {pageCount}
              </button>
            )}
            <button onClick={() => bumpZoom(-1)} title="Reduzir zoom (Ctrl+roda)">
              −
            </button>
            <select
              className="tb-select"
              value={zoom === "fit" ? "fit" : String(zoomNum)}
              onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
              title="Zoom"
            >
              <option value="fit">ajustar</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
              {zoomNum !== null && !ZOOMS.includes(zoomNum) && (
                <option value={zoomNum}>{Math.round(zoomNum * 100)}%</option>
              )}
            </select>
            <button onClick={() => bumpZoom(1)} title="Aumentar zoom (Ctrl+roda)">
              +
            </button>
            <span className="tb-sep" />
            <button
              className={props.panel === "ocr" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "ocr" ? "none" : "ocr")}
              title="OCR: reconhecer texto de PDF escaneado (offline)"
            >
              🔍<span className="lbl"> OCR</span>
            </button>
            <button
              className={props.panel === "forms" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "forms" ? "none" : "forms")}
              title="Preencher formulário (AcroForm)"
            >
              📝<span className="lbl"> Formulário</span>
            </button>
            <button
              className={props.panel === "ai" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "ai" ? "none" : "ai")}
              title="IA local: resumir e perguntar sobre o documento"
            >
              ✦<span className="lbl"> IA</span>
            </button>
          </span>
        )}
        <button
          className={doc ? "" : "tb-right"}
          onClick={() => setTheme(cycleTheme())}
          title={`Tema: ${THEME_LABEL[theme]} (clique pra alternar)`}
        >
          {THEME_ICON[theme]}
        </button>
      </div>

      {doc && (
        <div className="tb-row tb-tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? "active" : ""} onClick={() => setTool(t.id)} title={t.label}>
              {t.icon}
            </button>
          ))}
          <span className="tb-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`tb-color ${color === c ? "active" : ""}`}
                style={{ background: c }}
                onClick={() => pickColor(c)}
                title={selectedKind ? "Aplicar cor à anotação selecionada" : `Cor ${c}`}
              />
            ))}
          </span>
          {(tool === "text" || selectedKind === "text") && (
            <>
              <select
                className="tb-select"
                value={selectedKind === "text" ? (selectedFont ?? font) : font}
                onChange={(e) => pickFont(e.target.value as PdfFont)}
                title="Fonte (padrão do PDF — abre igual em qualquer leitor)"
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="tb-select"
                value={selectedKind === "text" ? (selectedSize ?? fontSize) : fontSize}
                onChange={(e) => pickFontSize(Number(e.target.value))}
                title="Tamanho da fonte"
              >
                {[10, 12, 14, 18, 24, 32, 48]
                  .concat(selectedKind === "text" && selectedSize && ![10, 12, 14, 18, 24, 32, 48].includes(selectedSize) ? [selectedSize] : [])
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {Math.round(n)} pt
                    </option>
                  ))}
              </select>
            </>
          )}
          {(tool === "ink" || selectedKind === "ink") && (
            <select
              className="tb-select"
              value={selectedKind === "ink" ? (selectedSize ?? strokeWidth) : strokeWidth}
              onChange={(e) => pickStroke(Number(e.target.value))}
              title="Espessura do traço"
            >
              {[1, 2, 3, 5, 8].map((n) => (
                <option key={n} value={n}>
                  {n} pt
                </option>
              ))}
            </select>
          )}
          <span className="tb-sep" />
          <button
            className={pendingImage ? "active" : ""}
            onClick={() => setSigOpen(true)}
            title="Assinar: desenhe uma vez, carimbe onde quiser"
          >
            ✍<span className="lbl"> Assinar</span>
          </button>
          <button onClick={doInsertImage} title="Carimbar uma imagem (PNG/JPG) na página">
            🖼
          </button>
          {pendingImage && <span className="tb-hint">clique na página pra posicionar</span>}
          {tool === "edittext" && !pendingImage && (
            <span className="tb-hint">clique numa linha de texto pra reescrever (beta)</span>
          )}
        </div>
      )}

      {sigOpen && <SignatureModal onClose={() => setSigOpen(false)} />}
    </header>
  );
}

/** Diálogo "salvar novo PDF" reutilizado pela extração de páginas. */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  const picked = await saveDialog({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: defaultName,
  });
  return picked ?? null;
}
