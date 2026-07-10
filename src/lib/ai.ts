// IA local do LocalPDF: ciclo de vida do sidecar llama.cpp (porta 8102+) e as
// ações sobre o documento — resumir (map-reduce, padrão do Writer) e Q&A com
// recuperação lexical de chunks (chunks.ts). A IA só LÊ o documento; nunca
// modifica o PDF.

import { invoke } from "@tauri-apps/api/core";
import { chunkPages, topChunks } from "./chunks";

// --- Rust command wrappers (camelCase keys -> snake_case Rust params) ---

export interface ModelInfo {
  name: string;
  path: string;
  size_gb: number;
  is_projector: boolean;
}

export interface LlmStatus {
  running: boolean;
  port: number;
  model: string;
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export const listModels = (dir: string) => invoke<ModelInfo[]>("list_models", { dir });
export const startLlm = (modelPath: string, nGpuLayers: number, ctxSize: number) =>
  invoke<number>("start_llm", { modelPath, nGpuLayers, ctxSize });
export const stopLlm = () => invoke<void>("stop_llm");
export const llmStatus = () => invoke<LlmStatus>("llm_status");

// --- llama-server HTTP (OpenAI-compatible, 127.0.0.1) ---

export interface StreamDelta {
  content?: string;
  reasoning?: string;
}

export async function streamChat(
  port: number,
  messages: ChatMsg[],
  onDelta: (d: StreamDelta) => void,
  opts: { temperature?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.3,
      // Mesmo truque do resto da suíte: desliga o "raciocínio" de modelos
      // Qwen3 e afins via template de chat. Quem não usa isso, ignora.
      chat_template_kwargs: { enable_thinking: false },
      reasoning_format: "none",
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`a IA respondeu ${res.status}`);

  let inThink = false;
  const routeContent = (text: string) => {
    while (text.length) {
      if (!inThink) {
        const i = text.indexOf("<think>");
        if (i === -1) return onDelta({ content: text });
        if (i > 0) onDelta({ content: text.slice(0, i) });
        inThink = true;
        text = text.slice(i + 7);
      } else {
        const j = text.indexOf("</think>");
        if (j === -1) return onDelta({ reasoning: text });
        if (j > 0) onDelta({ reasoning: text.slice(0, j) });
        inThink = false;
        text = text.slice(j + 8);
      }
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.reasoning_content) onDelta({ reasoning: delta.reasoning_content });
        if (delta.content) routeContent(delta.content);
      } catch {
        /* ignore partial */
      }
    }
  }
}

/** Chat sem streaming (coleta tudo) — usado no "map" do map-reduce. */
async function chatOnce(port: number, messages: ChatMsg[], signal?: AbortSignal): Promise<string> {
  let out = "";
  await streamChat(port, messages, (d) => (out += d.content ?? ""), { signal });
  return out.trim();
}

// ---------------------------------------------------------------------------
// ações sobre o documento
// ---------------------------------------------------------------------------

const SYSTEM =
  "Você é o assistente do LocalPDF, um leitor/editor de PDF offline. " +
  "Responda em português, de forma direta, usando SOMENTE o conteúdo do documento fornecido. " +
  "Quando citar algo, mencione a página (ex.: p. 3). Se a resposta não estiver no documento, diga isso.";

/** Junta as páginas até um teto de caracteres; devolve null se estourar. */
function joinIfSmall(pages: string[], cap: number): string | null {
  const total = pages.reduce((n, p) => n + p.length, 0);
  if (total > cap) return null;
  return pages.map((p, i) => (p.trim() ? `[página ${i + 1}]\n${p.trim()}` : "")).filter(Boolean).join("\n\n");
}

/**
 * Resume o documento. Cabe no contexto → passada única (streaming);
 * grande demais → map-reduce: resume blocos sem stream e combina com stream.
 */
export async function summarizeDoc(
  port: number,
  pages: string[],
  onDelta: (d: StreamDelta) => void,
  signal?: AbortSignal
): Promise<void> {
  const whole = joinIfSmall(pages, 7000);
  if (whole !== null) {
    await streamChat(
      port,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Resuma o documento a seguir em alguns parágrafos, cobrindo os pontos principais:\n\n${whole}` },
      ],
      onDelta,
      { signal }
    );
    return;
  }

  // map: resume blocos de ~6000 chars
  const blocks: { pages: string; text: string }[] = [];
  let cur = "";
  let firstPage = 1;
  for (let i = 0; i < pages.length; i++) {
    const t = pages[i].trim();
    if (cur && cur.length + t.length > 6000) {
      blocks.push({ pages: `${firstPage}–${i}`, text: cur });
      cur = "";
      firstPage = i + 1;
    }
    if (t) cur += `[página ${i + 1}]\n${t}\n\n`;
  }
  if (cur) blocks.push({ pages: `${firstPage}–${pages.length}`, text: cur });

  const partials: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    onDelta({ reasoning: `resumindo bloco ${i + 1}/${blocks.length} (páginas ${blocks[i].pages})…\n` });
    const part = await chatOnce(
      port,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Resuma o trecho a seguir em poucas frases objetivas:\n\n${blocks[i].text}` },
      ],
      signal
    );
    partials.push(`(páginas ${blocks[i].pages}) ${part}`);
  }

  // reduce: combina os parciais com streaming
  await streamChat(
    port,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          "Estes são resumos parciais de um documento, em ordem. Combine-os num resumo único e coerente, " +
          "em alguns parágrafos:\n\n" +
          partials.join("\n\n"),
      },
    ],
    onDelta,
    { signal }
  );
}

/** Q&A: recupera os chunks mais relevantes e pergunta com eles de contexto. */
export async function askDoc(
  port: number,
  pages: string[],
  question: string,
  onDelta: (d: StreamDelta) => void,
  signal?: AbortSignal
): Promise<void> {
  const chunks = chunkPages(pages);
  const picked = topChunks(question, chunks, 6000);
  const context = picked.map((c) => `[página ${c.page + 1}] ${c.text}`).join("\n\n");
  await streamChat(
    port,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Trechos do documento:\n\n${context}\n\nPergunta: ${question}`,
      },
    ],
    onDelta,
    { signal }
  );
}
