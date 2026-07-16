import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (mesmo padrão do LocalData/LocalDraw). `pt` é a fonte da
 * verdade das chaves; `en`/`es` como `Record<MessageKey, string>` fazem o
 * compilador recusar chave faltando ou sobrando. Locale num store externo (não
 * React) pra `t()` rodar fora de componente (labels de "ocupado" e erros do
 * store, prompts da IA…). O App remonta na troca (key={locale} no main.tsx).
 *
 * Inclui os prompts da IA (`ai.*`) — assim a IA responde no idioma da UI. Os
 * CÓDIGOS de OCR ("por"/"eng"), nomes de fonte (Helvetica/Times/Courier),
 * comandos Rust e chaves de localStorage NÃO passam por aqui: são domínio.
 */

export type Locale = "pt" | "en" | "es";

/** Endônimos — NÃO traduzir (cada idioma no seu próprio nome). */
export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

/** Tag BCP-47 por locale (pra toLocaleString/datas/Intl). */
const LOCALE_TAGS: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

const LOCALE_KEY = "localpdf.i18n";

const pt = {
  // --- comuns / idioma / tema ---
  "common.cancel": "Cancelar",
  "lang.title": "Idioma",
  "theme.toggle": "Tema: {theme} (clique pra alternar)",
  "theme.system": "sistema",
  "theme.light": "claro",
  "theme.dark": "escuro",

  // --- App (diálogo de saída, toasts) ---
  "app.confirmExit": "Há alterações não salvas. Sair mesmo assim?",
  "app.exitOk": "Sair sem salvar",

  // --- TopBar ---
  "tb.open": "Abrir",
  "tb.openTitle": "Abrir PDF (Ctrl+O)",
  "tb.save": "Salvar",
  "tb.saveTitle": "Salvar (Ctrl+S) — grava as anotações no PDF",
  "tb.saveAs": "Salvar como",
  "tb.saveAsTitle": "Salvar como (Ctrl+Shift+S)",
  "tb.merge": "Mesclar",
  "tb.mergeTitle": "Acrescentar as páginas de outro PDF ao fim",
  "tb.undoTitle": "Desfazer (Ctrl+Z)",
  "tb.redoTitle": "Refazer (Ctrl+Y)",
  "tb.dirtyTitle": "Alterações não salvas",
  "tb.searchTitle": "Buscar no documento (Ctrl+F)",
  "tb.goToPage": "Ir para a página…",
  "tb.pageOf": "p. {n} / {total}",
  "tb.zoomOut": "Reduzir zoom (Ctrl+roda)",
  "tb.zoomIn": "Aumentar zoom (Ctrl+roda)",
  "tb.zoomTitle": "Zoom",
  "tb.fit": "ajustar",
  "tb.ocr": "OCR",
  "tb.ocrTitle": "OCR: reconhecer texto de PDF escaneado (offline)",
  "tb.forms": "Formulário",
  "tb.formsTitle": "Preencher formulário (AcroForm)",
  "tb.ai": "IA",
  "tb.aiTitle": "IA local: resumir e perguntar sobre o documento",
  "tb.colorApply": "Aplicar cor à anotação selecionada",
  "tb.color": "Cor {c}",
  "tb.fontTitle": "Fonte (padrão do PDF — abre igual em qualquer leitor)",
  "tb.fontSizeTitle": "Tamanho da fonte",
  "tb.strokeTitle": "Espessura do traço",
  "tb.sign": "Assinar",
  "tb.signTitle": "Assinar: desenhe uma vez, carimbe onde quiser",
  "tb.imageTitle": "Carimbar uma imagem (PNG/JPG) na página",
  "tb.imgFilter": "Imagem",
  "tb.placeHint": "clique na página pra posicionar",
  "tb.editTextHint": "clique numa linha de texto pra reescrever (beta)",

  // --- ferramentas (tooltips) ---
  "tool.select": "Selecionar / mover — selecione texto e copie ou realce",
  "tool.highlight": "Realçar (arraste um retângulo)",
  "tool.text": "Caixa de texto (clique na página)",
  "tool.ink": "Desenho à mão livre",
  "tool.edittext": "Editar texto existente (beta) — clique numa linha",

  // --- StartScreen ---
  "start.tagline": "Seu editor de PDF, 100% offline. Nada sai da sua máquina.",
  "start.feat.pages": "📄 organizar páginas",
  "start.feat.annotate": "🖍 anotar e realçar",
  "start.feat.sign": "✍ assinar",
  "start.feat.forms": "📝 formulários",
  "start.feat.ocr": "🔍 OCR offline",
  "start.feat.ai": "✦ IA local",
  "start.open": "📂 Abrir PDF",
  "start.dragHint": "…ou arraste um arquivo .pdf pra cá (Ctrl+O)",
  "start.recents": "Recentes",

  // --- Viewer ---
  "viewer.textPlaceholder": "Digite o texto…",
  "viewer.textBoxTitle": "Arraste pra mover; duplo clique pra editar",
  "viewer.highlight": "🖍 Realçar",

  // --- Thumbnails / sumário ---
  "thumb.tocLoading": "Lendo sumário…",
  "thumb.tocEmpty": "Este PDF não tem sumário (capítulos).",
  "thumb.tocPage": "p. {n}",
  "thumb.tocUnavailable": "destino indisponível",
  "thumb.tabPages": "Páginas",
  "thumb.tabToc": "Sumário",
  "thumb.rotateLeft": "Girar {n} página(s) à esquerda",
  "thumb.rotateRight": "Girar {n} página(s) à direita",
  "thumb.extract": "Extrair {n} página(s) pra um novo PDF",
  "thumb.insertBlank": "Inserir página em branco depois da atual",
  "thumb.delete": "Excluir {n} página(s)",
  "thumb.extractName": "paginas-extraidas.pdf",

  // --- SearchBar ---
  "search.placeholder": "Buscar no documento…",
  "search.prev": "Anterior (Shift+Enter)",
  "search.next": "Próximo (Enter)",
  "search.close": "Fechar (Esc)",

  // --- AiPanel ---
  "aip.title": "✦ IA local",
  "aip.modelsDirTitle": "Pasta com modelos .gguf",
  "aip.modelsFolder": "Pasta de modelos",
  "aip.chooseModel": "— escolher modelo —",
  "aip.starting": "iniciando…",
  "aip.start": "▶ Iniciar IA",
  "aip.stop": "■ Parar IA",
  "aip.summarize": "Resumir documento",
  "aip.askPlaceholder": "Pergunte sobre o documento…",
  "aip.cancel": "✕ cancelar {label}",
  "aip.hint": "Aponte a pasta com modelos .gguf, escolha um e inicie. Tudo roda local (porta 8102+), nada sai da máquina.",
  "aip.onlineAt": "IA no ar em 127.0.0.1:{port}",
  "aip.stopped": "IA parada.",
  "aip.extracting": "extraindo texto do PDF…",
  "aip.errNoDoc": "nenhum documento aberto",
  "aip.errNoText": "este PDF não tem texto extraível — é escaneado; rode o 🔍 OCR primeiro",
  "aip.workSummary": "resumo",
  "aip.workQuestion": "pergunta",

  // --- OcrPanel ---
  "ocr.title": "🔍 OCR (texto de PDF escaneado)",
  "ocr.langPor": "Português",
  "ocr.langEng": "Inglês",
  "ocr.onlyScanned": "Só páginas sem texto",
  "ocr.recognize": "Reconhecer documento",
  "ocr.recognizing": "Reconhecendo {progress}",
  "ocr.pageProgress": "página {n} ({done}/{total})…",
  "ocr.cancel": "✕ Cancelar",
  "ocr.doneStats": "{pages} página(s) reconhecida(s), {words} palavra(s).",
  "ocr.makeSearchable": "Tornar pesquisável (texto invisível)",
  "ocr.makeSearchableHint":
    "Grava o texto reconhecido como camada invisível — depois é só Salvar. O PDF fica pesquisável e copiável em qualquer leitor.",
  "ocr.noneScanned": "Nenhuma página sem texto — este PDF já é pesquisável.",
  "ocr.allDone": "Todas as páginas já foram reconhecidas.",
  "ocr.canceled": "OCR cancelado.",
  "ocr.finished": "OCR concluído — busca e IA já enxergam o texto.",
  "ocr.footer": "Tudo roda na sua máquina (tesseract embarcado). Nada é enviado pra fora.",

  // --- FormsPanel ---
  "forms.reading": "Lendo campos…",
  "forms.title": "📝 Formulário",
  "forms.none": "Este PDF não tem campos de formulário (AcroForm).",
  "forms.unsupported": "{name} (tipo não suportado)",
  "forms.apply": "Aplicar no PDF",

  // --- SignatureModal ---
  "sig.title": "✍ Assinatura",
  "sig.savedAlt": "assinatura salva",
  "sig.useSaved": "Usar a salva",
  "sig.delete": "🗑 Apagar",
  "sig.drawHint": "Desenhe abaixo (mouse ou caneta):",
  "sig.clear": "Limpar",
  "sig.cancel": "Cancelar",
  "sig.use": "Usar → clique na página",

  // --- store: labels de "ocupado" (mostradas como "{busy}…") e erros ---
  "busy.opening": "abrindo",
  "busy.saving": "salvando",
  "busy.undoing": "desfazendo",
  "busy.redoing": "refazendo",
  "busy.searchableText": "gravando texto pesquisável",
  "busy.rotating": "girando",
  "busy.deleting": "excluindo",
  "busy.reordering": "reordenando",
  "busy.insertingPage": "inserindo página",
  "busy.merging": "mesclando",
  "busy.extracting": "extraindo",
  "busy.filling": "preenchendo",
  "err.deleteAll": "não dá pra excluir todas as páginas",

  // --- IA (prompts de sistema/usuário — a prosa é traduzida) ---
  "ai.system":
    "Você é o assistente do LocalPDF, um leitor/editor de PDF offline. " +
    "Responda em português, de forma direta, usando SOMENTE o conteúdo do documento fornecido. " +
    "Quando citar algo, mencione a página (ex.: p. 3). Se a resposta não estiver no documento, diga isso.",
  "ai.pageLabel": "[página {n}]",
  "ai.summarizeWhole": "Resuma o documento a seguir em alguns parágrafos, cobrindo os pontos principais:\n\n{text}",
  "ai.summarizeBlock": "Resuma o trecho a seguir em poucas frases objetivas:\n\n{text}",
  "ai.blockProgress": "resumindo bloco {i}/{total} (páginas {pages})…\n",
  "ai.partialPrefix": "(páginas {pages}) {text}",
  "ai.combine":
    "Estes são resumos parciais de um documento, em ordem. Combine-os num resumo único e coerente, " +
    "em alguns parágrafos:\n\n{partials}",
  "ai.qa": "Trechos do documento:\n\n{context}\n\nPergunta: {question}",
  "ai.err.status": "a IA respondeu {status}",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "common.cancel": "Cancel",
  "lang.title": "Language",
  "theme.toggle": "Theme: {theme} (click to switch)",
  "theme.system": "system",
  "theme.light": "light",
  "theme.dark": "dark",

  "app.confirmExit": "There are unsaved changes. Quit anyway?",
  "app.exitOk": "Quit without saving",

  "tb.open": "Open",
  "tb.openTitle": "Open PDF (Ctrl+O)",
  "tb.save": "Save",
  "tb.saveTitle": "Save (Ctrl+S) — bakes the annotations into the PDF",
  "tb.saveAs": "Save as",
  "tb.saveAsTitle": "Save as (Ctrl+Shift+S)",
  "tb.merge": "Merge",
  "tb.mergeTitle": "Append the pages of another PDF at the end",
  "tb.undoTitle": "Undo (Ctrl+Z)",
  "tb.redoTitle": "Redo (Ctrl+Y)",
  "tb.dirtyTitle": "Unsaved changes",
  "tb.searchTitle": "Search the document (Ctrl+F)",
  "tb.goToPage": "Go to page…",
  "tb.pageOf": "p. {n} / {total}",
  "tb.zoomOut": "Zoom out (Ctrl+wheel)",
  "tb.zoomIn": "Zoom in (Ctrl+wheel)",
  "tb.zoomTitle": "Zoom",
  "tb.fit": "fit",
  "tb.ocr": "OCR",
  "tb.ocrTitle": "OCR: recognize text from a scanned PDF (offline)",
  "tb.forms": "Form",
  "tb.formsTitle": "Fill in a form (AcroForm)",
  "tb.ai": "AI",
  "tb.aiTitle": "Local AI: summarize and ask about the document",
  "tb.colorApply": "Apply color to the selected annotation",
  "tb.color": "Color {c}",
  "tb.fontTitle": "Font (PDF standard — opens the same in any reader)",
  "tb.fontSizeTitle": "Font size",
  "tb.strokeTitle": "Stroke width",
  "tb.sign": "Sign",
  "tb.signTitle": "Sign: draw once, stamp it wherever you want",
  "tb.imageTitle": "Stamp an image (PNG/JPG) on the page",
  "tb.imgFilter": "Image",
  "tb.placeHint": "click the page to place it",
  "tb.editTextHint": "click a line of text to rewrite it (beta)",

  "tool.select": "Select / move — select text and copy or highlight",
  "tool.highlight": "Highlight (drag a rectangle)",
  "tool.text": "Text box (click the page)",
  "tool.ink": "Freehand drawing",
  "tool.edittext": "Edit existing text (beta) — click a line",

  "start.tagline": "Your PDF editor, 100% offline. Nothing leaves your machine.",
  "start.feat.pages": "📄 organize pages",
  "start.feat.annotate": "🖍 annotate and highlight",
  "start.feat.sign": "✍ sign",
  "start.feat.forms": "📝 forms",
  "start.feat.ocr": "🔍 offline OCR",
  "start.feat.ai": "✦ local AI",
  "start.open": "📂 Open PDF",
  "start.dragHint": "…or drag a .pdf file here (Ctrl+O)",
  "start.recents": "Recent",

  "viewer.textPlaceholder": "Type the text…",
  "viewer.textBoxTitle": "Drag to move; double-click to edit",
  "viewer.highlight": "🖍 Highlight",

  "thumb.tocLoading": "Reading outline…",
  "thumb.tocEmpty": "This PDF has no outline (chapters).",
  "thumb.tocPage": "p. {n}",
  "thumb.tocUnavailable": "destination unavailable",
  "thumb.tabPages": "Pages",
  "thumb.tabToc": "Outline",
  "thumb.rotateLeft": "Rotate {n} page(s) left",
  "thumb.rotateRight": "Rotate {n} page(s) right",
  "thumb.extract": "Extract {n} page(s) into a new PDF",
  "thumb.insertBlank": "Insert a blank page after the current one",
  "thumb.delete": "Delete {n} page(s)",
  "thumb.extractName": "extracted-pages.pdf",

  "search.placeholder": "Search the document…",
  "search.prev": "Previous (Shift+Enter)",
  "search.next": "Next (Enter)",
  "search.close": "Close (Esc)",

  "aip.title": "✦ Local AI",
  "aip.modelsDirTitle": "Folder with .gguf models",
  "aip.modelsFolder": "Models folder",
  "aip.chooseModel": "— choose a model —",
  "aip.starting": "starting…",
  "aip.start": "▶ Start AI",
  "aip.stop": "■ Stop AI",
  "aip.summarize": "Summarize document",
  "aip.askPlaceholder": "Ask about the document…",
  "aip.cancel": "✕ cancel {label}",
  "aip.hint": "Point to the folder with .gguf models, pick one and start. Everything runs locally (port 8102+), nothing leaves the machine.",
  "aip.onlineAt": "AI running at 127.0.0.1:{port}",
  "aip.stopped": "AI stopped.",
  "aip.extracting": "extracting text from the PDF…",
  "aip.errNoDoc": "no document open",
  "aip.errNoText": "this PDF has no extractable text — it is scanned; run 🔍 OCR first",
  "aip.workSummary": "summary",
  "aip.workQuestion": "question",

  "ocr.title": "🔍 OCR (text from a scanned PDF)",
  "ocr.langPor": "Portuguese",
  "ocr.langEng": "English",
  "ocr.onlyScanned": "Only pages without text",
  "ocr.recognize": "Recognize document",
  "ocr.recognizing": "Recognizing {progress}",
  "ocr.pageProgress": "page {n} ({done}/{total})…",
  "ocr.cancel": "✕ Cancel",
  "ocr.doneStats": "{pages} page(s) recognized, {words} word(s).",
  "ocr.makeSearchable": "Make searchable (invisible text)",
  "ocr.makeSearchableHint":
    "Writes the recognized text as an invisible layer — then just Save. The PDF becomes searchable and copyable in any reader.",
  "ocr.noneScanned": "No page without text — this PDF is already searchable.",
  "ocr.allDone": "All pages have already been recognized.",
  "ocr.canceled": "OCR canceled.",
  "ocr.finished": "OCR finished — search and AI can now see the text.",
  "ocr.footer": "Everything runs on your machine (embedded tesseract). Nothing is sent out.",

  "forms.reading": "Reading fields…",
  "forms.title": "📝 Form",
  "forms.none": "This PDF has no form fields (AcroForm).",
  "forms.unsupported": "{name} (unsupported type)",
  "forms.apply": "Apply to the PDF",

  "sig.title": "✍ Signature",
  "sig.savedAlt": "saved signature",
  "sig.useSaved": "Use the saved one",
  "sig.delete": "🗑 Delete",
  "sig.drawHint": "Draw below (mouse or pen):",
  "sig.clear": "Clear",
  "sig.cancel": "Cancel",
  "sig.use": "Use → click the page",

  "busy.opening": "opening",
  "busy.saving": "saving",
  "busy.undoing": "undoing",
  "busy.redoing": "redoing",
  "busy.searchableText": "writing searchable text",
  "busy.rotating": "rotating",
  "busy.deleting": "deleting",
  "busy.reordering": "reordering",
  "busy.insertingPage": "inserting page",
  "busy.merging": "merging",
  "busy.extracting": "extracting",
  "busy.filling": "filling",
  "err.deleteAll": "can't delete every page",

  "ai.system":
    "You are the LocalPDF assistant, an offline PDF reader/editor. " +
    "Reply in English, directly, using ONLY the content of the provided document. " +
    "When you cite something, mention the page (e.g. p. 3). If the answer isn't in the document, say so.",
  "ai.pageLabel": "[page {n}]",
  "ai.summarizeWhole": "Summarize the following document in a few paragraphs, covering the main points:\n\n{text}",
  "ai.summarizeBlock": "Summarize the following excerpt in a few objective sentences:\n\n{text}",
  "ai.blockProgress": "summarizing block {i}/{total} (pages {pages})…\n",
  "ai.partialPrefix": "(pages {pages}) {text}",
  "ai.combine":
    "These are partial summaries of a document, in order. Combine them into a single, coherent summary, " +
    "in a few paragraphs:\n\n{partials}",
  "ai.qa": "Document excerpts:\n\n{context}\n\nQuestion: {question}",
  "ai.err.status": "the AI replied {status}",
};

const es: Record<MessageKey, string> = {
  "common.cancel": "Cancelar",
  "lang.title": "Idioma",
  "theme.toggle": "Tema: {theme} (clic para cambiar)",
  "theme.system": "sistema",
  "theme.light": "claro",
  "theme.dark": "oscuro",

  "app.confirmExit": "Hay cambios sin guardar. ¿Salir de todos modos?",
  "app.exitOk": "Salir sin guardar",

  "tb.open": "Abrir",
  "tb.openTitle": "Abrir PDF (Ctrl+O)",
  "tb.save": "Guardar",
  "tb.saveTitle": "Guardar (Ctrl+S) — graba las anotaciones en el PDF",
  "tb.saveAs": "Guardar como",
  "tb.saveAsTitle": "Guardar como (Ctrl+Shift+S)",
  "tb.merge": "Combinar",
  "tb.mergeTitle": "Añadir las páginas de otro PDF al final",
  "tb.undoTitle": "Deshacer (Ctrl+Z)",
  "tb.redoTitle": "Rehacer (Ctrl+Y)",
  "tb.dirtyTitle": "Cambios sin guardar",
  "tb.searchTitle": "Buscar en el documento (Ctrl+F)",
  "tb.goToPage": "Ir a la página…",
  "tb.pageOf": "p. {n} / {total}",
  "tb.zoomOut": "Reducir zoom (Ctrl+rueda)",
  "tb.zoomIn": "Aumentar zoom (Ctrl+rueda)",
  "tb.zoomTitle": "Zoom",
  "tb.fit": "ajustar",
  "tb.ocr": "OCR",
  "tb.ocrTitle": "OCR: reconocer texto de un PDF escaneado (sin conexión)",
  "tb.forms": "Formulario",
  "tb.formsTitle": "Rellenar formulario (AcroForm)",
  "tb.ai": "IA",
  "tb.aiTitle": "IA local: resumir y preguntar sobre el documento",
  "tb.colorApply": "Aplicar color a la anotación seleccionada",
  "tb.color": "Color {c}",
  "tb.fontTitle": "Fuente (estándar del PDF — se abre igual en cualquier lector)",
  "tb.fontSizeTitle": "Tamaño de la fuente",
  "tb.strokeTitle": "Grosor del trazo",
  "tb.sign": "Firmar",
  "tb.signTitle": "Firmar: dibuja una vez, coloca el sello donde quieras",
  "tb.imageTitle": "Colocar una imagen (PNG/JPG) en la página",
  "tb.imgFilter": "Imagen",
  "tb.placeHint": "haz clic en la página para colocarla",
  "tb.editTextHint": "haz clic en una línea de texto para reescribirla (beta)",

  "tool.select": "Seleccionar / mover — selecciona texto y copia o resalta",
  "tool.highlight": "Resaltar (arrastra un rectángulo)",
  "tool.text": "Cuadro de texto (haz clic en la página)",
  "tool.ink": "Dibujo a mano alzada",
  "tool.edittext": "Editar texto existente (beta) — haz clic en una línea",

  "start.tagline": "Tu editor de PDF, 100% sin conexión. Nada sale de tu máquina.",
  "start.feat.pages": "📄 organizar páginas",
  "start.feat.annotate": "🖍 anotar y resaltar",
  "start.feat.sign": "✍ firmar",
  "start.feat.forms": "📝 formularios",
  "start.feat.ocr": "🔍 OCR sin conexión",
  "start.feat.ai": "✦ IA local",
  "start.open": "📂 Abrir PDF",
  "start.dragHint": "…o arrastra un archivo .pdf aquí (Ctrl+O)",
  "start.recents": "Recientes",

  "viewer.textPlaceholder": "Escribe el texto…",
  "viewer.textBoxTitle": "Arrastra para mover; doble clic para editar",
  "viewer.highlight": "🖍 Resaltar",

  "thumb.tocLoading": "Leyendo el índice…",
  "thumb.tocEmpty": "Este PDF no tiene índice (capítulos).",
  "thumb.tocPage": "p. {n}",
  "thumb.tocUnavailable": "destino no disponible",
  "thumb.tabPages": "Páginas",
  "thumb.tabToc": "Índice",
  "thumb.rotateLeft": "Girar {n} página(s) a la izquierda",
  "thumb.rotateRight": "Girar {n} página(s) a la derecha",
  "thumb.extract": "Extraer {n} página(s) a un nuevo PDF",
  "thumb.insertBlank": "Insertar una página en blanco después de la actual",
  "thumb.delete": "Eliminar {n} página(s)",
  "thumb.extractName": "paginas-extraidas.pdf",

  "search.placeholder": "Buscar en el documento…",
  "search.prev": "Anterior (Shift+Enter)",
  "search.next": "Siguiente (Enter)",
  "search.close": "Cerrar (Esc)",

  "aip.title": "✦ IA local",
  "aip.modelsDirTitle": "Carpeta con modelos .gguf",
  "aip.modelsFolder": "Carpeta de modelos",
  "aip.chooseModel": "— elegir modelo —",
  "aip.starting": "iniciando…",
  "aip.start": "▶ Iniciar IA",
  "aip.stop": "■ Parar IA",
  "aip.summarize": "Resumir documento",
  "aip.askPlaceholder": "Pregunta sobre el documento…",
  "aip.cancel": "✕ cancelar {label}",
  "aip.hint": "Apunta a la carpeta con modelos .gguf, elige uno e inicia. Todo se ejecuta en local (puerto 8102+), nada sale de la máquina.",
  "aip.onlineAt": "IA activa en 127.0.0.1:{port}",
  "aip.stopped": "IA detenida.",
  "aip.extracting": "extrayendo texto del PDF…",
  "aip.errNoDoc": "ningún documento abierto",
  "aip.errNoText": "este PDF no tiene texto extraíble — está escaneado; ejecuta 🔍 OCR primero",
  "aip.workSummary": "resumen",
  "aip.workQuestion": "pregunta",

  "ocr.title": "🔍 OCR (texto de un PDF escaneado)",
  "ocr.langPor": "Portugués",
  "ocr.langEng": "Inglés",
  "ocr.onlyScanned": "Solo páginas sin texto",
  "ocr.recognize": "Reconocer documento",
  "ocr.recognizing": "Reconociendo {progress}",
  "ocr.pageProgress": "página {n} ({done}/{total})…",
  "ocr.cancel": "✕ Cancelar",
  "ocr.doneStats": "{pages} página(s) reconocida(s), {words} palabra(s).",
  "ocr.makeSearchable": "Hacer buscable (texto invisible)",
  "ocr.makeSearchableHint":
    "Graba el texto reconocido como capa invisible — luego solo guarda. El PDF queda buscable y copiable en cualquier lector.",
  "ocr.noneScanned": "Ninguna página sin texto — este PDF ya es buscable.",
  "ocr.allDone": "Todas las páginas ya fueron reconocidas.",
  "ocr.canceled": "OCR cancelado.",
  "ocr.finished": "OCR terminado — la búsqueda y la IA ya ven el texto.",
  "ocr.footer": "Todo se ejecuta en tu máquina (tesseract integrado). Nada se envía fuera.",

  "forms.reading": "Leyendo campos…",
  "forms.title": "📝 Formulario",
  "forms.none": "Este PDF no tiene campos de formulario (AcroForm).",
  "forms.unsupported": "{name} (tipo no admitido)",
  "forms.apply": "Aplicar al PDF",

  "sig.title": "✍ Firma",
  "sig.savedAlt": "firma guardada",
  "sig.useSaved": "Usar la guardada",
  "sig.delete": "🗑 Borrar",
  "sig.drawHint": "Dibuja abajo (ratón o lápiz):",
  "sig.clear": "Limpiar",
  "sig.cancel": "Cancelar",
  "sig.use": "Usar → haz clic en la página",

  "busy.opening": "abriendo",
  "busy.saving": "guardando",
  "busy.undoing": "deshaciendo",
  "busy.redoing": "rehaciendo",
  "busy.searchableText": "grabando texto buscable",
  "busy.rotating": "girando",
  "busy.deleting": "eliminando",
  "busy.reordering": "reordenando",
  "busy.insertingPage": "insertando página",
  "busy.merging": "combinando",
  "busy.extracting": "extrayendo",
  "busy.filling": "rellenando",
  "err.deleteAll": "no se pueden eliminar todas las páginas",

  "ai.system":
    "Eres el asistente de LocalPDF, un lector/editor de PDF sin conexión. " +
    "Responde en español, de forma directa, usando SOLO el contenido del documento proporcionado. " +
    "Cuando cites algo, menciona la página (ej.: p. 3). Si la respuesta no está en el documento, dilo.",
  "ai.pageLabel": "[página {n}]",
  "ai.summarizeWhole": "Resume el siguiente documento en unos párrafos, cubriendo los puntos principales:\n\n{text}",
  "ai.summarizeBlock": "Resume el siguiente fragmento en pocas frases concretas:\n\n{text}",
  "ai.blockProgress": "resumiendo bloque {i}/{total} (páginas {pages})…\n",
  "ai.partialPrefix": "(páginas {pages}) {text}",
  "ai.combine":
    "Estos son resúmenes parciales de un documento, en orden. Combínalos en un resumen único y coherente, " +
    "en unos párrafos:\n\n{partials}",
  "ai.qa": "Fragmentos del documento:\n\n{context}\n\nPregunta: {question}",
  "ai.err.status": "la IA respondió {status}",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Tag BCP-47 do locale atual ("pt-BR"/"en-US"/"es-ES"). */
export function localeTag(): string {
  return LOCALE_TAGS[current];
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
