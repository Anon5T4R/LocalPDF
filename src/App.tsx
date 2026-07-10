import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getStartupFile } from "./lib/backend";
import { useStore } from "./state/store";
import TopBar from "./components/TopBar";
import Thumbnails from "./components/Thumbnails";
import Viewer from "./components/Viewer";
import FormsPanel from "./components/FormsPanel";
import AiPanel from "./components/AiPanel";
import OcrPanel from "./components/OcrPanel";
import SearchBar from "./components/SearchBar";
import StartScreen from "./components/StartScreen";
import "./App.css";

export type SidePanel = "none" | "forms" | "ai" | "ocr";

const RECENT_KEY = "localpdf.recent";

// fora do Tauri (ex.: vite dev num browser comum) as APIs nativas não existem
const inTauri = "__TAURI_INTERNALS__" in window;

export function recentFiles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(path: string) {
  const list = [path, ...recentFiles().filter((p) => p !== path)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function App() {
  const doc = useStore((s) => s.doc);
  const filePath = useStore((s) => s.filePath);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const openFile = useStore((s) => s.openFile);
  const save = useStore((s) => s.save);
  const saveAs = useStore((s) => s.saveAs);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setError = useStore((s) => s.setError);
  const selectedAnnot = useStore((s) => s.selectedAnnot);
  const removeAnnot = useStore((s) => s.removeAnnot);

  const [panel, setPanel] = useState<SidePanel>("none");
  const [searchOpen, setSearchOpen] = useState(false);

  const doOpenDialog = useCallback(async () => {
    const picked = await openDialog({ filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (typeof picked === "string") {
      await openFile(picked);
      pushRecent(picked);
    }
  }, [openFile]);

  const doSaveAs = useCallback(async () => {
    const picked = await saveDialog({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: filePath ?? undefined,
    });
    if (picked) {
      await saveAs(picked);
      pushRecent(picked);
    }
  }, [saveAs, filePath]);

  const doSave = useCallback(async () => {
    if (filePath) await save();
    else await doSaveAs();
  }, [filePath, save, doSaveAs]);

  // arquivo passado na linha de comando (associação .pdf) + 2ª instância
  useEffect(() => {
    if (!inTauri) return;
    getStartupFile().then((f) => {
      if (f) {
        openFile(f);
        pushRecent(f);
      }
    });
    const un = listen<string>("open-file", (e) => {
      openFile(e.payload);
      pushRecent(e.payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, [openFile]);

  // drag & drop de .pdf na janela
  useEffect(() => {
    if (!inTauri) return;
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") {
        const pdf = e.payload.paths.find((p) => p.toLowerCase().endsWith(".pdf"));
        if (pdf) {
          openFile(pdf);
          pushRecent(pdf);
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [openFile]);

  // título da janela acompanha o arquivo aberto e o estado sujo
  const dirtyForTitle = useStore((s) => s.dirty);
  useEffect(() => {
    if (!inTauri) return;
    const name = filePath ? filePath.replace(/^.*[\\/]/, "") : "";
    const title = name ? `${dirtyForTitle ? "● " : ""}${name} — LocalPDF` : "LocalPDF";
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [filePath, dirtyForTitle]);

  // confirmar fechar com alterações não salvas
  useEffect(() => {
    if (!inTauri) return;
    const un = getCurrentWindow().onCloseRequested(async (e) => {
      if (useStore.getState().dirty) {
        const leave = await ask("Há alterações não salvas. Sair mesmo assim?", {
          title: "LocalPDF",
          kind: "warning",
        });
        if (!leave) e.preventDefault();
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const editing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        doOpenDialog();
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) doSaveAs();
        else doSave();
      } else if (mod && e.key.toLowerCase() === "z" && !editing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y" && !editing) {
        e.preventDefault();
        redo();
      } else if (mod && (e.key === "=" || e.key === "+" || e.key === "-")) {
        e.preventDefault();
        const s = useStore.getState();
        const cur = typeof s.zoom === "number" ? s.zoom : 1;
        const next = e.key === "-" ? cur - 0.1 : cur + 0.1;
        s.setZoom(Math.min(4, Math.max(0.25, Math.round(next * 100) / 100)));
      } else if (e.key === "Escape" && !editing) {
        const s = useStore.getState();
        if (s.pendingImage) s.setPendingImage(null);
        else if (s.selectedAnnot) s.setSelectedAnnot(null);
        else if (s.tool !== "select") s.setTool("select");
      } else if (e.key === "Delete" && selectedAnnot && !editing) {
        removeAnnot(selectedAnnot.page, selectedAnnot.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doOpenDialog, doSave, doSaveAs, undo, redo, selectedAnnot, removeAnnot]);

  return (
    <div className="app">
      <TopBar
        onOpen={doOpenDialog}
        onSave={doSave}
        onSaveAs={doSaveAs}
        onSearch={() => setSearchOpen(true)}
        panel={panel}
        setPanel={setPanel}
      />
      {doc ? (
        <div className="main">
          <Thumbnails />
          <Viewer />
          {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
          {panel === "forms" && <FormsPanel />}
          {panel === "ai" && <AiPanel />}
          {panel === "ocr" && <OcrPanel />}
        </div>
      ) : (
        <StartScreen onOpen={doOpenDialog} />
      )}
      {busy && (
        <div className="busy-badge" role="status">
          {busy}…
        </div>
      )}
      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          ⚠ {error} <span className="error-close">×</span>
        </div>
      )}
    </div>
  );
}
