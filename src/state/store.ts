// Estado central do LocalPDF (zustand).
//
// Fonte da verdade do documento = `bytes` (Uint8Array). Toda operação
// estrutural (pdf-lib) produz bytes novos → recarrega o pdf.js e re-renderiza.
// Anotações ficam FORA dos bytes até salvar (aí são "queimadas" via pdf-lib).
// Undo/redo = snapshots de {bytes, annots} (cap pra não estourar RAM).

import { create } from "zustand";
import { loadPdf, type PDFDocumentProxy } from "../lib/pdfjs";
import * as ops from "../lib/ops";
import { readFileBytes, writeFileBytes } from "../lib/backend";
import { rotateAnnots, viewportSize, type PageGeom } from "../lib/coords";
import type { Annot, AnnotMap, OcrResult, PdfFont, PendingImage, Tool } from "../lib/types";

interface Snapshot {
  bytes: Uint8Array;
  annots: AnnotMap;
}

const UNDO_CAP = 12;

export interface PdfStore {
  filePath: string | null;
  bytes: Uint8Array | null;
  doc: PDFDocumentProxy | null;
  docVersion: number;
  geoms: PageGeom[];
  vpSizes: { w: number; h: number }[];
  dirty: boolean;
  busy: string | null;
  error: string | null;

  selected: number[];
  current: number;
  zoom: number | "fit";
  tool: Tool;
  color: string;
  fontSize: number;
  strokeWidth: number;
  font: PdfFont;
  annots: AnnotMap;
  selectedAnnot: { page: number; id: string } | null;
  /** assinatura/carimbo esperando o clique que posiciona na página */
  pendingImage: PendingImage | null;
  /** OCR por página (some quando os bytes mudam — coords ficariam órfãs) */
  ocrPages: Record<number, OcrResult>;
  /** destaque temporário do resultado da busca */
  searchFlash: { page: number; rects: { x: number; y: number; w: number; h: number }[] } | null;

  undoStack: Snapshot[];
  redoStack: Snapshot[];

  openFile(path: string): Promise<void>;
  openBytes(bytes: Uint8Array, path: string | null): Promise<void>;
  closeDoc(): void;
  save(): Promise<void>;
  saveAs(path: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;

  setZoom(z: number | "fit"): void;
  setTool(t: Tool): void;
  setColor(c: string): void;
  setFontSize(n: number): void;
  setStrokeWidth(n: number): void;
  setFont(f: PdfFont): void;
  setCurrent(i: number): void;
  setError(e: string | null): void;
  selectPage(i: number, additive: boolean): void;
  clearSelection(): void;

  setPendingImage(p: PendingImage | null): void;
  setOcrPage(page: number, res: OcrResult): void;
  setSearchFlash(f: PdfStore["searchFlash"]): void;
  /** queima o texto do OCR como texto invisível (PDF pesquisável) */
  makeSearchable(): Promise<void>;
  addAnnot(page: number, annot: Annot): void;
  updateAnnot(page: number, annot: Annot): void;
  removeAnnot(page: number, id: string): void;
  setSelectedAnnot(sel: { page: number; id: string } | null): void;
  /**
   * Marca o início de uma mudança de anotação que vai gerar vários
   * updateAnnot (arrastar/redimensionar/editar) — empilha UM undo pro lote.
   */
  beginAnnotTx(): void;
  /** Adiciona várias anotações como UMA entrada de undo (seleção→realce, edição de linha). */
  addAnnotsBatch(items: { page: number; annot: Annot }[]): void;

  rotateSelected(delta: number): Promise<void>;
  deleteSelected(): Promise<void>;
  movePages(src: number[], dest: number): Promise<void>;
  insertBlankAfter(index: number): Promise<void>;
  mergeWith(path: string): Promise<void>;
  extractSelected(path: string): Promise<void>;
  applyFormValues(values: Record<string, string | boolean>): Promise<void>;
}

async function parseBytes(bytes: Uint8Array) {
  const [doc, geoms] = await Promise.all([loadPdf(bytes), ops.allPageGeoms(bytes)]);
  return { doc, geoms, vpSizes: geoms.map(viewportSize) };
}

export const useStore = create<PdfStore>()((set, get) => {
  /** Empilha o estado atual {bytes, annots} no undo (limpa o redo). */
  function pushHistory() {
    const s = get();
    if (!s.bytes) return;
    set({
      undoStack: [...s.undoStack.slice(-UNDO_CAP + 1), { bytes: s.bytes, annots: s.annots }],
      redoStack: [],
    });
  }

  /** Troca os bytes do documento (empilha undo, recarrega o pdf.js). */
  async function applyBytes(
    newBytes: Uint8Array,
    opts: {
      remapAnnots?: (a: AnnotMap) => AnnotMap;
      pushUndo?: boolean;
      markDirty?: boolean;
      filePath?: string | null;
    } = {}
  ) {
    const s = get();
    const parsed = await parseBytes(newBytes);
    s.doc?.destroy().catch(() => {});
    const annots = opts.remapAnnots ? opts.remapAnnots(s.annots) : s.annots;
    const undoStack =
      opts.pushUndo !== false && s.bytes
        ? [...s.undoStack.slice(-UNDO_CAP + 1), { bytes: s.bytes, annots: s.annots }]
        : s.undoStack;
    set({
      bytes: newBytes,
      ...parsed,
      docVersion: s.docVersion + 1,
      annots,
      undoStack,
      redoStack: opts.pushUndo !== false ? [] : s.redoStack,
      dirty: opts.markDirty !== false,
      selectedAnnot: null,
      // bytes mudaram → coords/índices do OCR e do flash ficariam órfãos
      ocrPages: {},
      searchFlash: null,
      ...(opts.filePath !== undefined ? { filePath: opts.filePath } : {}),
    });
  }

  /** Roda uma operação com trava de "ocupado" e captura de erro. */
  async function run(label: string, fn: () => Promise<void>) {
    if (get().busy) return;
    set({ busy: label, error: null });
    try {
      await fn();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ busy: null });
    }
  }

  return {
    filePath: null,
    bytes: null,
    doc: null,
    docVersion: 0,
    geoms: [],
    vpSizes: [],
    dirty: false,
    busy: null,
    error: null,

    selected: [],
    current: 0,
    zoom: "fit",
    tool: "select",
    color: "#facc15",
    fontSize: 14,
    strokeWidth: 2,
    font: "helvetica",
    annots: {},
    selectedAnnot: null,
    pendingImage: null,
    ocrPages: {},
    searchFlash: null,

    undoStack: [],
    redoStack: [],

    openFile: (path) =>
      run("abrindo", async () => {
        const bytes = await readFileBytes(path);
        await get().openBytes(bytes, path);
      }),

    openBytes: async (bytes, path) => {
      const parsed = await parseBytes(bytes);
      get().doc?.destroy().catch(() => {});
      set({
        filePath: path,
        bytes,
        ...parsed,
        docVersion: get().docVersion + 1,
        dirty: false,
        annots: {},
        selected: [],
        current: 0,
        undoStack: [],
        redoStack: [],
        selectedAnnot: null,
        ocrPages: {},
        searchFlash: null,
        zoom: "fit",
      });
    },

    closeDoc: () => {
      get().doc?.destroy().catch(() => {});
      set({
        filePath: null,
        bytes: null,
        doc: null,
        geoms: [],
        vpSizes: [],
        dirty: false,
        annots: {},
        selected: [],
        current: 0,
        undoStack: [],
        redoStack: [],
        selectedAnnot: null,
        error: null,
      });
    },

    save: () =>
      run("salvando", async () => {
        const { bytes, annots, filePath } = get();
        if (!bytes || !filePath) return;
        const baked = await ops.bakeAnnotations(bytes, annots);
        await writeFileBytes(filePath, baked);
        if (baked !== bytes) {
          await applyBytes(baked, { remapAnnots: () => ({}), markDirty: false });
        }
        set({ dirty: false });
      }),

    saveAs: (path) =>
      run("salvando", async () => {
        const { bytes, annots } = get();
        if (!bytes) return;
        const baked = await ops.bakeAnnotations(bytes, annots);
        await writeFileBytes(path, baked);
        if (baked !== bytes) {
          await applyBytes(baked, { remapAnnots: () => ({}), markDirty: false, filePath: path });
        } else {
          set({ filePath: path });
        }
        set({ dirty: false });
      }),

    undo: () =>
      run("desfazendo", async () => {
        const s = get();
        const snap = s.undoStack[s.undoStack.length - 1];
        if (!snap || !s.bytes) return;
        const stacks = {
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { bytes: s.bytes, annots: s.annots }],
        };
        if (snap.bytes === s.bytes) {
          // só anotações mudaram — não precisa reparsear o documento
          set({ annots: snap.annots, ...stacks, dirty: true, selectedAnnot: null });
          return;
        }
        const parsed = await parseBytes(snap.bytes);
        s.doc?.destroy().catch(() => {});
        set({
          bytes: snap.bytes,
          ...parsed,
          docVersion: s.docVersion + 1,
          annots: snap.annots,
          ...stacks,
          dirty: true,
          selected: [],
          selectedAnnot: null,
        });
      }),

    redo: () =>
      run("refazendo", async () => {
        const s = get();
        const snap = s.redoStack[s.redoStack.length - 1];
        if (!snap || !s.bytes) return;
        const stacks = {
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, { bytes: s.bytes, annots: s.annots }],
        };
        if (snap.bytes === s.bytes) {
          set({ annots: snap.annots, ...stacks, dirty: true, selectedAnnot: null });
          return;
        }
        const parsed = await parseBytes(snap.bytes);
        s.doc?.destroy().catch(() => {});
        set({
          bytes: snap.bytes,
          ...parsed,
          docVersion: s.docVersion + 1,
          annots: snap.annots,
          ...stacks,
          dirty: true,
          selected: [],
          selectedAnnot: null,
        });
      }),

    setZoom: (zoom) => set({ zoom }),
    setTool: (tool) => set({ tool, selectedAnnot: null, pendingImage: null }),
    setPendingImage: (pendingImage) => set({ pendingImage }),
    setOcrPage: (page, res) => set((s) => ({ ocrPages: { ...s.ocrPages, [page]: res } })),
    setSearchFlash: (searchFlash) => set({ searchFlash }),

    makeSearchable: () =>
      run("gravando texto pesquisável", async () => {
        const { bytes, ocrPages } = get();
        if (!bytes) return;
        const words = Object.fromEntries(Object.entries(ocrPages).map(([k, v]) => [k, v.words]));
        await applyBytes(await ops.bakeInvisibleText(bytes, words));
      }),
    setColor: (color) => set({ color }),
    setFontSize: (fontSize) => set({ fontSize }),
    setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
    setFont: (font) => set({ font }),
    setCurrent: (current) => set({ current }),
    setError: (error) => set({ error }),

    selectPage: (i, additive) =>
      set((s) => {
        if (!additive) return { selected: [i], current: i };
        const has = s.selected.includes(i);
        const selected = has ? s.selected.filter((x) => x !== i) : [...s.selected, i].sort((a, b) => a - b);
        return { selected, current: i };
      }),
    clearSelection: () => set({ selected: [] }),

    addAnnot: (page, annot) => {
      pushHistory();
      set((s) => ({
        annots: { ...s.annots, [page]: [...(s.annots[page] ?? []), annot] },
        dirty: true,
      }));
    },
    updateAnnot: (page, annot) =>
      // sem push aqui: quem inicia a mudança chama beginAnnotTx() uma vez
      set((s) => ({
        annots: {
          ...s.annots,
          [page]: (s.annots[page] ?? []).map((a) => (a.id === annot.id ? annot : a)),
        },
        dirty: true,
      })),
    removeAnnot: (page, id) => {
      pushHistory();
      set((s) => ({
        annots: { ...s.annots, [page]: (s.annots[page] ?? []).filter((a) => a.id !== id) },
        selectedAnnot: s.selectedAnnot?.id === id ? null : s.selectedAnnot,
        dirty: true,
      }));
    },
    setSelectedAnnot: (selectedAnnot) => set({ selectedAnnot }),
    beginAnnotTx: () => pushHistory(),

    addAnnotsBatch: (items) => {
      if (!items.length) return;
      pushHistory();
      set((s) => {
        const annots = { ...s.annots };
        for (const { page, annot } of items) annots[page] = [...(annots[page] ?? []), annot];
        return { annots, dirty: true };
      });
    },

    rotateSelected: (delta) =>
      run("girando", async () => {
        const { bytes, selected, current, geoms } = get();
        if (!bytes) return;
        const pages = selected.length ? selected : [current];
        const rotated = new Set(pages);
        const oldGeoms = geoms;
        await applyBytes(await ops.rotatePages(bytes, pages, delta), {
          // o viewport da página girada muda — reancora as anotações pendentes
          remapAnnots: (annots) => {
            const out: AnnotMap = {};
            for (const [k, list] of Object.entries(annots)) {
              const i = Number(k);
              out[i] = rotated.has(i) && oldGeoms[i] ? rotateAnnots(list, oldGeoms[i], delta) : list;
            }
            return out;
          },
        });
      }),

    deleteSelected: () =>
      run("excluindo", async () => {
        const { bytes, selected, current, vpSizes } = get();
        if (!bytes) return;
        const pages = selected.length ? selected : [current];
        if (pages.length >= vpSizes.length) throw new Error("não dá pra excluir todas as páginas");
        const removed = new Set(pages);
        await applyBytes(await ops.deletePages(bytes, pages), {
          remapAnnots: (annots) => {
            const out: AnnotMap = {};
            for (const [k, list] of Object.entries(annots)) {
              const i = Number(k);
              if (removed.has(i)) continue;
              const shift = pages.filter((p) => p < i).length;
              out[i - shift] = list;
            }
            return out;
          },
        });
        set({ selected: [], current: Math.min(get().current, get().vpSizes.length - 1) });
      }),

    movePages: (src, dest) =>
      run("reordenando", async () => {
        const { bytes, vpSizes } = get();
        if (!bytes) return;
        const n = vpSizes.length;
        const moving = [...src].sort((a, b) => a - b);
        const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !moving.includes(i));
        // dest é a posição de inserção medida na lista SEM os movidos
        const before = Math.min(
          rest.length,
          dest - moving.filter((m) => m < dest).length
        );
        const order = [...rest.slice(0, before), ...moving, ...rest.slice(before)];
        if (order.every((v, i) => v === i)) return; // nada mudou
        await applyBytes(await ops.reorderPages(bytes, order), {
          remapAnnots: (annots) => {
            const out: AnnotMap = {};
            order.forEach((oldIdx, newIdx) => {
              if (annots[oldIdx]?.length) out[newIdx] = annots[oldIdx];
            });
            return out;
          },
        });
        const newSel = order
          .map((oldIdx, newIdx) => (moving.includes(oldIdx) ? newIdx : -1))
          .filter((x) => x >= 0);
        set({ selected: newSel });
      }),

    insertBlankAfter: (index) =>
      run("inserindo página", async () => {
        const { bytes } = get();
        if (!bytes) return;
        const at = index + 1;
        await applyBytes(await ops.insertBlankPage(bytes, at), {
          remapAnnots: (annots) => {
            const out: AnnotMap = {};
            for (const [k, list] of Object.entries(annots)) {
              const i = Number(k);
              out[i >= at ? i + 1 : i] = list;
            }
            return out;
          },
        });
      }),

    mergeWith: (path) =>
      run("mesclando", async () => {
        const { bytes } = get();
        if (!bytes) return;
        const other = await readFileBytes(path);
        await applyBytes(await ops.mergePdf(bytes, other));
      }),

    extractSelected: (path) =>
      run("extraindo", async () => {
        const { bytes, selected, current } = get();
        if (!bytes) return;
        const pages = selected.length ? selected : [current];
        const out = await ops.extractPages(bytes, pages);
        await writeFileBytes(path, out);
      }),

    applyFormValues: (values) =>
      run("preenchendo", async () => {
        const { bytes } = get();
        if (!bytes) return;
        await applyBytes(await ops.fillForm(bytes, values));
      }),
  };
});

// Só em dev: expõe o store no console (depurar/testar fora do Tauri).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pdfStore = useStore;
}
