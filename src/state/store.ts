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
import { viewportSize, type PageGeom } from "../lib/coords";
import type { Annot, AnnotMap, Tool } from "../lib/types";

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
  annots: AnnotMap;
  selectedAnnot: { page: number; id: string } | null;

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
  setCurrent(i: number): void;
  setError(e: string | null): void;
  selectPage(i: number, additive: boolean): void;
  clearSelection(): void;

  addAnnot(page: number, annot: Annot): void;
  updateAnnot(page: number, annot: Annot): void;
  removeAnnot(page: number, id: string): void;
  setSelectedAnnot(sel: { page: number; id: string } | null): void;

  rotateSelected(delta: number): Promise<void>;
  deleteSelected(): Promise<void>;
  movePages(src: number[], dest: number): Promise<void>;
  mergeWith(path: string): Promise<void>;
  extractSelected(path: string): Promise<void>;
  applyFormValues(values: Record<string, string | boolean>): Promise<void>;
}

async function parseBytes(bytes: Uint8Array) {
  const [doc, geoms] = await Promise.all([loadPdf(bytes), ops.allPageGeoms(bytes)]);
  return { doc, geoms, vpSizes: geoms.map(viewportSize) };
}

export const useStore = create<PdfStore>()((set, get) => {
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
    annots: {},
    selectedAnnot: null,

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
        const parsed = await parseBytes(snap.bytes);
        s.doc?.destroy().catch(() => {});
        set({
          bytes: snap.bytes,
          ...parsed,
          docVersion: s.docVersion + 1,
          annots: snap.annots,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { bytes: s.bytes, annots: s.annots }],
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
        const parsed = await parseBytes(snap.bytes);
        s.doc?.destroy().catch(() => {});
        set({
          bytes: snap.bytes,
          ...parsed,
          docVersion: s.docVersion + 1,
          annots: snap.annots,
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, { bytes: s.bytes, annots: s.annots }],
          dirty: true,
          selected: [],
          selectedAnnot: null,
        });
      }),

    setZoom: (zoom) => set({ zoom }),
    setTool: (tool) => set({ tool, selectedAnnot: null }),
    setColor: (color) => set({ color }),
    setFontSize: (fontSize) => set({ fontSize }),
    setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
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

    addAnnot: (page, annot) =>
      set((s) => ({
        annots: { ...s.annots, [page]: [...(s.annots[page] ?? []), annot] },
        dirty: true,
      })),
    updateAnnot: (page, annot) =>
      set((s) => ({
        annots: {
          ...s.annots,
          [page]: (s.annots[page] ?? []).map((a) => (a.id === annot.id ? annot : a)),
        },
        dirty: true,
      })),
    removeAnnot: (page, id) =>
      set((s) => ({
        annots: { ...s.annots, [page]: (s.annots[page] ?? []).filter((a) => a.id !== id) },
        selectedAnnot: s.selectedAnnot?.id === id ? null : s.selectedAnnot,
        dirty: true,
      })),
    setSelectedAnnot: (selectedAnnot) => set({ selectedAnnot }),

    rotateSelected: (delta) =>
      run("girando", async () => {
        const { bytes, selected, current } = get();
        if (!bytes) return;
        const pages = selected.length ? selected : [current];
        await applyBytes(await ops.rotatePages(bytes, pages, delta));
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
