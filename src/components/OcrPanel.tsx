// OCR offline (tesseract.js, por/eng). Reconhece páginas escaneadas; o texto
// alimenta busca e IA na hora, e "Tornar pesquisável" queima texto invisível
// no PDF (persistido no Salvar).

import { useRef, useState } from "react";
import { disposeOcr, ocrPage } from "../lib/ocr";
import { getPagesText } from "../lib/textcache";
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
        setNote(
          onlyScanned
            ? "Nenhuma página sem texto — este PDF já é pesquisável."
            : "Todas as páginas já foram reconhecidas."
        );
        return;
      }
      let n = 0;
      for (const i of targets) {
        if (cancelRef.current) break;
        setProgress(`página ${i + 1} (${++n}/${targets.length})…`);
        const res = await ocrPage(doc, i, langs);
        setOcrPage(i, res);
      }
      setNote(cancelRef.current ? "OCR cancelado." : "OCR concluído — busca e IA já enxergam o texto.");
    } catch (e) {
      setNote(String(e));
    } finally {
      setProgress(null);
      await disposeOcr();
    }
  };

  return (
    <aside className="side-panel">
      <h3>🔍 OCR (texto de PDF escaneado)</h3>
      <label className="form-field form-check">
        <input type="checkbox" checked={langPor} onChange={(e) => setLangPor(e.target.checked)} />
        <span>Português</span>
      </label>
      <label className="form-field form-check">
        <input type="checkbox" checked={langEng} onChange={(e) => setLangEng(e.target.checked)} />
        <span>Inglês</span>
      </label>
      <label className="form-field form-check">
        <input type="checkbox" checked={onlyScanned} onChange={(e) => setOnlyScanned(e.target.checked)} />
        <span>Só páginas sem texto</span>
      </label>

      {!progress ? (
        <button className="primary" onClick={run} disabled={!langs || !!busy}>
          Reconhecer documento
        </button>
      ) : (
        <>
          <p className="muted small">Reconhecendo {progress}</p>
          <button onClick={() => (cancelRef.current = true)}>✕ Cancelar</button>
        </>
      )}

      {donePages > 0 && (
        <>
          <p className="muted small">
            {donePages} página(s) reconhecida(s), {totalWords} palavra(s).
          </p>
          <button className="primary" onClick={makeSearchable} disabled={!!busy || !!progress}>
            Tornar pesquisável (texto invisível)
          </button>
          <p className="muted small">
            Grava o texto reconhecido como camada invisível — depois é só Salvar. O PDF fica pesquisável e
            copiável em qualquer leitor.
          </p>
        </>
      )}
      {note && <p className="muted small">{note}</p>}
      <p className="muted small">Tudo roda na sua máquina (tesseract embarcado). Nada é enviado pra fora.</p>
    </aside>
  );
}
