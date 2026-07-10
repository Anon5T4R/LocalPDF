import { recentFiles } from "../App";
import { useStore } from "../state/store";

const FEATURES = [
  "📄 organizar páginas",
  "🖍 anotar e realçar",
  "✍ assinar",
  "📝 formulários",
  "🔍 OCR offline",
  "✦ IA local",
];

export default function StartScreen(props: { onOpen: () => void }) {
  const openFile = useStore((s) => s.openFile);
  const recents = recentFiles();

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-logo">📄</div>
        <h1>LocalPDF</h1>
        <p className="muted">Seu editor de PDF, 100% offline. Nada sai da sua máquina.</p>
        <div className="start-features">
          {FEATURES.map((f) => (
            <span key={f} className="start-feature">
              {f}
            </span>
          ))}
        </div>
        <button className="primary big" onClick={props.onOpen}>
          📂 Abrir PDF
        </button>
        <p className="muted small">…ou arraste um arquivo .pdf pra cá (Ctrl+O)</p>
        {recents.length > 0 && (
          <div className="recents">
            <h4>Recentes</h4>
            {recents.map((p) => (
              <button key={p} className="recent" onClick={() => openFile(p)} title={p}>
                {p.replace(/^.*[\\/]/, "")}
                <small>{p}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
