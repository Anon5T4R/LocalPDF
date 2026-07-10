import { useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readFileBytes } from "../lib/backend";
import { cycleTheme, getThemePref, type ThemePref } from "../lib/theme";
import { useStore } from "../state/store";
import type { SidePanel } from "../App";
import type { Tool } from "../lib/types";
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
          📂 Abrir
        </button>
        <button onClick={props.onSave} disabled={!doc || !!busy} title="Salvar (Ctrl+S) — grava as anotações no PDF">
          💾 Salvar
        </button>
        <button onClick={props.onSaveAs} disabled={!doc || !!busy} title="Salvar como (Ctrl+Shift+S)">
          Salvar como
        </button>
        <button onClick={doMerge} disabled={!doc || !!busy} title="Acrescentar as páginas de outro PDF ao fim">
          ➕ Mesclar
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
              🔍 OCR
            </button>
            <button
              className={props.panel === "forms" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "forms" ? "none" : "forms")}
              title="Preencher formulário (AcroForm)"
            >
              📝 Formulário
            </button>
            <button
              className={props.panel === "ai" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "ai" ? "none" : "ai")}
              title="IA local: resumir e perguntar sobre o documento"
            >
              ✦ IA
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
                onClick={() => setColor(c)}
                title={`Cor ${c}`}
              />
            ))}
          </span>
          {tool === "text" && (
            <select
              className="tb-select"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              title="Tamanho da fonte"
            >
              {[10, 12, 14, 18, 24, 32, 48].map((n) => (
                <option key={n} value={n}>
                  {n} pt
                </option>
              ))}
            </select>
          )}
          {tool === "ink" && (
            <select
              className="tb-select"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
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
            ✍ Assinar
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
