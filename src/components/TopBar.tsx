import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import type { SidePanel } from "../App";
import type { Tool } from "../lib/types";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "select", icon: "🖱", label: "Selecionar / mover" },
  { id: "highlight", icon: "🖍", label: "Realçar (arraste um retângulo)" },
  { id: "text", icon: "🅣", label: "Caixa de texto (clique na página)" },
  { id: "ink", icon: "✏", label: "Desenho à mão livre" },
];

const COLORS = ["#facc15", "#4ade80", "#60a5fa", "#f87171", "#111111"];

export default function TopBar(props: {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  panel: SidePanel;
  setPanel: (p: SidePanel) => void;
}) {
  const doc = useStore((s) => s.doc);
  const filePath = useStore((s) => s.filePath);
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

  const fileName = filePath ? filePath.replace(/^.*[\\/]/, "") : "";

  return (
    <header className="topbar">
      <div className="tb-group">
        <button onClick={props.onOpen} title="Abrir PDF (Ctrl+O)">
          📂 Abrir
        </button>
        <button onClick={props.onSave} disabled={!doc || !!busy} title="Salvar (Ctrl+S) — queima as anotações">
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
      </div>

      {doc && (
        <>
          <div className="tb-group">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "active" : ""}
                onClick={() => setTool(t.id)}
                title={t.label}
              >
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
          </div>

          <div className="tb-group tb-right">
            <span className="tb-page">
              p. {Math.min(current + 1, pageCount)} / {pageCount}
            </span>
            <button onClick={() => bumpZoom(-1)} title="Reduzir zoom">
              −
            </button>
            <button className={zoom === "fit" ? "active" : ""} onClick={() => setZoom("fit")} title="Ajustar à largura">
              {zoomNum ? `${Math.round(zoomNum * 100)}%` : "ajustar"}
            </button>
            <button onClick={() => bumpZoom(1)} title="Aumentar zoom">
              +
            </button>
            <span className="tb-sep" />
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
          </div>
          <span className="tb-file" title={filePath ?? ""}>
            {fileName}
          </span>
        </>
      )}
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
