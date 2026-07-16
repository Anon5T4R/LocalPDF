// OCR offline (tesseract.js, por/eng). Reconhece páginas escaneadas; o texto
// alimenta busca e IA na hora, e "Tornar pesquisável" queima texto invisível
// no PDF (persistido no Salvar).

import { useRef, useState } from "react";
import { disposeOcr, ocrPage } from "../lib/ocr";
import { getPagesText } from "../lib/textcache";
import { t } from "../lib/i18n";
import { useStore } from "../state/store";

export default function OcrPanel() {
  const doc = useStore((s) => s.doc);
  const docVersion = useStore((s) => s.docVersion);
  const ocrPages = useStore((s) => s.ocrPages);
  const setOcrPage = useStore((s) => s.setOcrPage);
  const makeSearchable = useStore((s) => s.makeSearchable);
  const busy = useStore((s) => s.busy);

  const [langPor, setLangPor] = useState(true);
  const [langEng, setLangEng] = useState(false);
  const [onlyScanned, setOnlyScanned] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const cancelRef = useRef(false);

  const langs = [langPor && "por", langEng && "eng"].filter(Boolean).join("+");
  const donePages = Object.keys(ocrPages).length;
  const totalWords = Object.values(ocrPages).reduce((n, r) => n + r.words.length, 0);

  const run = async () => {
    if (!doc || progress || !langs) return;
    cancelRef.current = false;
    setNote("");
    try {
      const texts = await getPagesText(doc, docVersion);
      const targets: number[] = [];
      for (let i = 0; i < doc.numPages; i++) {
        if (ocrPages[i]) continue; // já reconhecida
        if (onlyScanned && texts[i]?.trim()) continue;
        targets.push(i);
      }
      if (!targets.length) {
        setNote(onlyScanned ? t("ocr.noneScanned") : t("ocr.allDone"));
        return;
      }
      let n = 0;
      for (const i of targets) {
        if (cancelRef.current) break;
        setProgress(t("ocr.pageProgress", { n: i + 1, done: ++n, total: targets.length }));
        const res = await ocrPage(doc, i, langs);
        setOcrPage(i, res);
      }
      setNote(cancelRef.current ? t("ocr.canceled") : t("ocr.finished"));
    } catch (e) {
      setNote(String(e));
    } finally {
      setProgress(null);
      await disposeOcr();
    }
  };

  return (
    <aside className="side-panel">
      <h3>{t("ocr.title")}</h3>
      <label className="form-field form-check">
        <input type="checkbox" checked={langPor} onChange={(e) => setLangPor(e.target.checked)} />
        <span>{t("ocr.langPor")}</span>
      </label>
      <label className="form-field form-check">
        <input type="checkbox" checked={langEng} onChange={(e) => setLangEng(e.target.checked)} />
        <span>{t("ocr.langEng")}</span>
      </label>
      <label className="form-field form-check">
        <input type="checkbox" checked={onlyScanned} onChange={(e) => setOnlyScanned(e.target.checked)} />
        <span>{t("ocr.onlyScanned")}</span>
      </label>

      {!progress ? (
        <button className="primary" onClick={run} disabled={!langs || !!busy}>
          {t("ocr.recognize")}
        </button>
      ) : (
        <>
          <p className="muted small">{t("ocr.recognizing", { progress })}</p>
          <button onClick={() => (cancelRef.current = true)}>{t("ocr.cancel")}</button>
        </>
      )}

      {donePages > 0 && (
        <>
          <p className="muted small">{t("ocr.doneStats", { pages: donePages, words: totalWords })}</p>
          <button className="primary" onClick={makeSearchable} disabled={!!busy || !!progress}>
            {t("ocr.makeSearchable")}
          </button>
          <p className="muted small">{t("ocr.makeSearchableHint")}</p>
        </>
      )}
      {note && <p className="muted small">{note}</p>}
      <p className="muted small">{t("ocr.footer")}</p>
    </aside>
  );
}
