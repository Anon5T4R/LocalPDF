import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  askDoc,
  listModels,
  llmStatus,
  startLlm,
  stopLlm,
  summarizeDoc,
  type ModelInfo,
} from "../lib/ai";
import { getMergedPagesText } from "../lib/textcache";
import { useStore } from "../state/store";

const DIR_KEY = "localpdf.modelsDir";

export default function AiPanel() {
  const doc = useStore((s) => s.doc);
  const docVersion = useStore((s) => s.docVersion);

  const [modelsDir, setModelsDir] = useState<string>(() => localStorage.getItem(DIR_KEY) ?? "");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelPath, setModelPath] = useState("");
  const [port, setPort] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [question, setQuestion] = useState("");
  const [output, setOutput] = useState("");
  const [note, setNote] = useState("");
  const [workingOn, setWorkingOn] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textCache = useRef<{ version: number; pages: string[] } | null>(null);

  useEffect(() => {
    llmStatus()
      .then((s) => {
        setRunning(s.running);
        setPort(s.port);
        if (s.model) setModelPath(s.model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!modelsDir) return;
    listModels(modelsDir)
      .then((m) => setModels(m.filter((x) => !x.is_projector)))
      .catch((e) => setNote(String(e)));
  }, [modelsDir]);

  const pickDir = async () => {
    const picked = await openDialog({ directory: true });
    if (typeof picked === "string") {
      localStorage.setItem(DIR_KEY, picked);
      setModelsDir(picked);
      setNote("");
    }
  };

  const start = async () => {
    if (!modelPath) return;
    setStarting(true);
    setNote("");
    try {
      // default da suíte: CPU (-ngl 0) e contexto 4096 — hardware alvo modesto
      const p = await startLlm(modelPath, 0, 4096);
      setPort(p);
      setRunning(true);
      setNote(`IA no ar em 127.0.0.1:${p}`);
    } catch (e) {
      setNote(String(e));
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    abortRef.current?.abort();
    await stopLlm().catch(() => {});
    setRunning(false);
    setNote("IA parada.");
  };

  const getPages = async (): Promise<string[]> => {
    if (!doc) throw new Error("nenhum documento aberto");
    if (textCache.current?.version === docVersion) return textCache.current.pages;
    setNote("extraindo texto do PDF…");
    const pages = await getMergedPagesText(doc, docVersion, useStore.getState().ocrPages);
    textCache.current = { version: docVersion, pages };
    setNote("");
    if (!pages.some((p) => p.trim())) {
      throw new Error("este PDF não tem texto extraível — é escaneado; rode o 🔍 OCR primeiro");
    }
    return pages;
  };

  const runAction = async (fn: (pages: string[], signal: AbortSignal) => Promise<void>, label: string) => {
    if (!running || workingOn) return;
    setWorkingOn(label);
    setOutput("");
    setNote("");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const pages = await getPages();
      await fn(pages, ctl.signal);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setNote(String(e));
    } finally {
      setWorkingOn(null);
    }
  };

  const doSummarize = () =>
    runAction(
      (pages, signal) =>
        summarizeDoc(port, pages, (d) => {
          if (d.content) setOutput((o) => o + d.content);
          if (d.reasoning) setNote(d.reasoning.trim());
        }, signal),
      "resumo"
    );

  const doAsk = () => {
    const q = question.trim();
    if (!q) return;
    runAction(
      (pages, signal) =>
        askDoc(port, pages, q, (d) => {
          if (d.content) setOutput((o) => o + d.content);
        }, signal),
      "pergunta"
    );
  };

  return (
    <aside className="side-panel ai-panel">
      <h3>✦ IA local</h3>

      <div className="ai-setup">
        <button onClick={pickDir} title="Pasta com modelos .gguf">
          📁 {modelsDir ? modelsDir.replace(/^.*[\\/]/, "") : "Pasta de modelos"}
        </button>
        {models.length > 0 && (
          <select value={modelPath} onChange={(e) => setModelPath(e.target.value)}>
            <option value="">— escolher modelo —</option>
            {models.map((m) => (
              <option key={m.path} value={m.path}>
                {m.name} ({m.size_gb.toFixed(1)} GB)
              </option>
            ))}
          </select>
        )}
        {!running ? (
          <button className="primary" onClick={start} disabled={!modelPath || starting}>
            {starting ? "iniciando…" : "▶ Iniciar IA"}
          </button>
        ) : (
          <button onClick={stop}>■ Parar IA</button>
        )}
      </div>

      <div className="ai-actions">
        <button onClick={doSummarize} disabled={!running || !!workingOn}>
          Resumir documento
        </button>
        <div className="ai-ask">
          <input
            type="text"
            placeholder="Pergunte sobre o documento…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doAsk()}
            disabled={!running || !!workingOn}
          />
          <button onClick={doAsk} disabled={!running || !!workingOn || !question.trim()}>
            ➤
          </button>
        </div>
        {workingOn && (
          <button onClick={() => abortRef.current?.abort()} className="ai-abort">
            ✕ cancelar {workingOn}
          </button>
        )}
      </div>

      {note && <p className="muted small">{note}</p>}
      {output && <div className="ai-output">{output}</div>}
      {!running && !output && (
        <p className="muted small">
          Aponte a pasta com modelos .gguf, escolha um e inicie. Tudo roda local (porta 8102+), nada sai da
          máquina.
        </p>
      )}
    </aside>
  );
}
