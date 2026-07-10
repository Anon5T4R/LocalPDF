import { recentFiles } from "../App";
import { useStore } from "../state/store";

export default function StartScreen(props: { onOpen: () => void }) {
  const openFile = useStore((s) => s.openFile);
  const recents = recentFiles();

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-logo">📄</div>
        <h1>LocalPDF</h1>
        <p className="muted">
          Visualize, organize páginas, anote e preencha formulários — 100% offline, com IA local.
        </p>
        <button className="primary big" onClick={props.onOpen}>
          📂 Abrir PDF
        </button>
        <p className="muted small">…ou arraste um arquivo .pdf pra cá</p>
        {recents.length > 0 && (
          <div className="recents">
            <h4>Recentes</h4>
            {recents.map((p) => (
              <button key={p} className="recent" onClick={() => openFile(p)} title={p}>
                {p.replace(/^.*[\\/]/, "")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
