# LocalPDF

Editor de PDF **100% offline** com **IA local**, parte da suíte Taylor.

- **Visualizar** — renderização fiel com [pdf.js](https://mozilla.github.io/pdf.js/) (Mozilla), zoom, miniaturas.
- **Organizar páginas** — mesclar outro PDF, extrair/dividir, reordenar (arrastar miniaturas), rotacionar e excluir, com [pdf-lib](https://pdf-lib.js.org/) (MIT). Undo/redo.
- **Anotar** — realce, caixa de texto e desenho à mão sobre a página; as anotações são "queimadas" no PDF ao salvar.
- **Formulários** — preencher campos AcroForm (texto, checkbox, rádio, dropdown).
- **IA local** — resuma e converse com o documento usando modelos GGUF via [llama.cpp](https://github.com/ggml-org/llama.cpp) rodando só em `127.0.0.1` (porta 8102+). Zero telemetria, zero nuvem.

## Desenvolvimento

```sh
npm install
npm run tauri dev
```

O runtime de IA (llama-server) não é versionado — baixe com:

```sh
# Windows
powershell -ExecutionPolicy Bypass -File scripts/fetch-llama.ps1
# Linux
bash scripts/fetch-llama.sh
```

Modelos `.gguf` não são distribuídos com o app: aponte a pasta de modelos no painel **✦ IA**.

## Build de release

Tag `v*` dispara o CI (Windows NSIS + Linux AppImage). Local: `npm run tauri build`.

## Licença

MIT.
