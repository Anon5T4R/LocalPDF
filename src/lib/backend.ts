// Ponte com o Rust: só mover bytes e caminho de arquivo (regra da suíte —
// parse/manipulação de PDF fica toda no webview).

import { invoke } from "@tauri-apps/api/core";

export const getStartupFile = () => invoke<string | null>("get_startup_file");

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const b64 = await invoke<string>("read_file_base64", { path });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  // conversão em blocos pra não estourar o limite de argumentos do fromCharCode
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  await invoke("write_file_base64", { path, base64Data: btoa(bin) });
}
