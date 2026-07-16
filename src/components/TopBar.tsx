import { useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readFileBytes } from "../lib/backend";
import { cycleTheme, getThemePref, type ThemePref } from "../lib/theme";
import { t as tr, type MessageKey } from "../lib/i18n";
import { useStore } from "../state/store";
import type { SidePanel } from "../App";
import type { Annot, PdfFont, Tool } from "../lib/types";
import SignatureModal from "./SignatureModal";
import LocalePicker from "./LocalePicker";

const TOOLS: { id: Tool; icon: string; labelKey: MessageKey }[] = [
  { id: "select", icon: "🖱", labelKey: "tool.select" },
  { id: "highlight", icon: "🖍", labelKey: "tool.highlight" },
  { id: "text", icon: "🅣", labelKey: "tool.text" },
  { id: "ink", icon: "✏", labelKey: "tool.ink" },
  { id: "edittext", icon: "✎", labelKey: "tool.edittext" },
];

const COLORS = ["#facc15", "#4ade80", "#60a5fa", "#f87171", "#111111"];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
// Nomes próprios das fontes padrão do PDF — NÃO traduzir.
const FONTS: { id: PdfFont; label: string }[] = [
  { id: "helvetica", label: "Helvetica" },
  { id: "times", label: "Times" },
  { id: "courier", label: "Courier" },
];
const THEME_ICON: Record<ThemePref, string> = { system: "🌓", light: "☀", dark: "🌙" };
const THEME_LABEL_KEY: Record<ThemePref, MessageKey> = {
  system: "theme.system",
  light: "theme.light",
  dark: "theme.dark",
};

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
      filters: [{ name: tr("tb.imgFilter"), extensions: ["png", "jpg", "jpeg"] }],
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
        <button onClick={props.onOpen} title={tr("tb.openTitle")}>
          📂<span className="lbl"> {tr("tb.open")}</span>
        </button>
        <button onClick={props.onSave} disabled={!doc || !!busy} title={tr("tb.saveTitle")}>
          💾<span className="lbl"> {tr("tb.save")}</span>
        </button>
        <button onClick={props.onSaveAs} disabled={!doc || !!busy} title={tr("tb.saveAsTitle")}>
          💾<span className="lbl"> {tr("tb.saveAs")}</span><span className="lbl-mini">…</span>
        </button>
        <button onClick={doMerge} disabled={!doc || !!busy} title={tr("tb.mergeTitle")}>
          ➕<span className="lbl"> {tr("tb.merge")}</span>
        </button>
        <span className="tb-sep" />
        <button onClick={undo} disabled={!canUndo || !!busy} title={tr("tb.undoTitle")}>
          ↩
        </button>
        <button onClick={redo} disabled={!canRedo || !!busy} title={tr("tb.redoTitle")}>
          ↪
        </button>

        <span className="tb-file" title={filePath ?? ""}>
          {fileName}
          {dirty && <span className="tb-dirty" title={tr("tb.dirtyTitle")} />}
        </span>

        {doc && (
          <span className="tb-right">
            <button onClick={props.onSearch} title={tr("tb.searchTitle")}>
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
              <button className="tb-page" onClick={() => setPageInput(String(current + 1))} title={tr("tb.goToPage")}>
                {tr("tb.pageOf", { n: Math.min(current + 1, pageCount), total: pageCount })}
              </button>
            )}
            <button onClick={() => bumpZoom(-1)} title={tr("tb.zoomOut")}>
              −
            </button>
            <select
              className="tb-select"
              value={zoom === "fit" ? "fit" : String(zoomNum)}
              onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
              title={tr("tb.zoomTitle")}
            >
              <option value="fit">{tr("tb.fit")}</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
              {zoomNum !== null && !ZOOMS.includes(zoomNum) && (
                <option value={zoomNum}>{Math.round(zoomNum * 100)}%</option>
              )}
            </select>
            <button onClick={() => bumpZoom(1)} title={tr("tb.zoomIn")}>
              +
            </button>
            <span className="tb-sep" />
            <button
              className={props.panel === "ocr" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "ocr" ? "none" : "ocr")}
              title={tr("tb.ocrTitle")}
            >
              🔍<span className="lbl"> {tr("tb.ocr")}</span>
            </button>
            <button
              className={props.panel === "forms" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "forms" ? "none" : "forms")}
              title={tr("tb.formsTitle")}
            >
              📝<span className="lbl"> {tr("tb.forms")}</span>
            </button>
            <button
              className={props.panel === "ai" ? "active" : ""}
              onClick={() => props.setPanel(props.panel === "ai" ? "none" : "ai")}
              title={tr("tb.aiTitle")}
            >
              ✦<span className="lbl"> {tr("tb.ai")}</span>
            </button>
          </span>
        )}
        <span className={doc ? "" : "tb-right"} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <LocalePicker />
          <button
            onClick={() => setTheme(cycleTheme())}
            title={tr("theme.toggle", { theme: tr(THEME_LABEL_KEY[theme]) })}
          >
            {THEME_ICON[theme]}
          </button>
        </span>
      </div>

      {doc && (
        <div className="tb-row tb-tools">
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              className={tool === tl.id ? "active" : ""}
              onClick={() => setTool(tl.id)}
              title={tr(tl.labelKey)}
            >
              {tl.icon}
            </button>
          ))}
          <span className="tb-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`tb-color ${color === c ? "active" : ""}`}
                style={{ background: c }}
                onClick={() => pickColor(c)}
                title={selectedKind ? tr("tb.colorApply") : tr("tb.color", { c })}
              />
            ))}
          </span>
          {(tool === "text" || selectedKind === "text") && (
            <>
              <select
                className="tb-select"
                value={selectedKind === "text" ? (selectedFont ?? font) : font}
                onChange={(e) => pickFont(e.target.value as PdfFont)}
                title={tr("tb.fontTitle")}
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
                title={tr("tb.fontSizeTitle")}
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
              title={tr("tb.strokeTitle")}
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
            title={tr("tb.signTitle")}
          >
            ✍<span className="lbl"> {tr("tb.sign")}</span>
          </button>
          <button onClick={doInsertImage} title={tr("tb.imageTitle")}>
            🖼
          </button>
          {pendingImage && <span className="tb-hint">{tr("tb.placeHint")}</span>}
          {tool === "edittext" && !pendingImage && (
            <span className="tb-hint">{tr("tb.editTextHint")}</span>
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
