import { recentFiles } from "../App";
import { t, type MessageKey } from "../lib/i18n";
import { useStore } from "../state/store";

const FEATURE_KEYS: MessageKey[] = [
  "start.feat.pages",
  "start.feat.annotate",
  "start.feat.sign",
  "start.feat.forms",
  "start.feat.ocr",
  "start.feat.ai",
];

export default function StartScreen(props: { onOpen: () => void }) {
  const openFile = useStore((s) => s.openFile);
  const recents = recentFiles();

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-logo">📄</div>
        <h1>LocalPDF</h1>
        <p className="muted">{t("start.tagline")}</p>
        <div className="start-features">
          {FEATURE_KEYS.map((k) => (
            <span key={k} className="start-feature">
              {t(k)}
            </span>
          ))}
        </div>
        <button className="primary big" onClick={props.onOpen}>
          {t("start.open")}
        </button>
        <p className="muted small">{t("start.dragHint")}</p>
        {recents.length > 0 && (
          <div className="recents">
            <h4>{t("start.recents")}</h4>
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
