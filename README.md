# LocalPDF

Editor de PDF **100% offline** com **IA local**, parte da suíte Local.

- **Visualizar** — renderização fiel com [pdf.js](https://mozilla.github.io/pdf.js/) (Mozilla), zoom, miniaturas, **seleção/cópia de texto** e **busca (Ctrl+F)** com destaque do trecho.
- **Organizar páginas** — mesclar outro PDF, extrair/dividir, reordenar (arrastar miniaturas), rotacionar, excluir e inserir página em branco, com [pdf-lib](https://pdf-lib.js.org/) (MIT). Undo/redo.
- **Anotar** — realce (retângulo ou direto da seleção de texto), caixa de texto, desenho à mão; as anotações são "queimadas" no PDF ao salvar.
- **Assinar e carimbar** — desenhe sua assinatura uma vez e carimbe onde quiser; insira imagens PNG/JPG.
- **Editar texto existente (beta)** — clique numa linha e reescreva (cobre e redesenha; parágrafos simples).
- **Formulários** — preencher campos AcroForm (texto, checkbox, rádio, dropdown).
- **OCR offline** — [Tesseract](https://github.com/tesseract-ocr/tesseract) embarcado (por/eng): reconhece PDF escaneado, alimenta busca e IA, e grava camada de **texto invisível pesquisável**.
- **IA local** — resuma e converse com o documento usando modelos GGUF via [llama.cpp](https://github.com/ggml-org/llama.cpp) rodando só em `127.0.0.1` (porta 8102+). Zero telemetria, zero nuvem.
- **Tema claro/escuro** (segue o sistema, com alternador).

## Desenvolvimento

```sh
npm install
npm run tauri dev
```

O runtime de IA (llama-server) e os assets do OCR não são versionados — baixe com:

```sh
# Windows
powershell -ExecutionPolicy Bypass -File scripts/fetch-llama.ps1
powershell -ExecutionPolicy Bypass -File scripts/fetch-tessdata.ps1
# Linux
bash scripts/fetch-llama.sh
bash scripts/fetch-tessdata.sh
```

Modelos `.gguf` não são distribuídos com o app: aponte a pasta de modelos no painel **✦ IA**.

## Build de release

Tag `v*` dispara o CI (Windows NSIS + Linux AppImage). Local: `npm run tauri build`.

## Licença

MIT.
