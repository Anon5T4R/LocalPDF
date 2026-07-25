mod llm;

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// File path passed at launch (e.g. when opening a `.pdf` with the app), if any.
#[tauri::command(async)]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// Read any file as base64. Regra da suíte: todo parse/manipulação de PDF fica
/// no webview (pdf.js/pdf-lib); o Rust só move bytes.
#[tauri::command(async)]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| format!("Falha ao ler '{}': {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Write a base64 payload to disk as binary (salvar PDF).
#[tauri::command(async)]
fn write_file_base64(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("base64 inválido: {}", e))?;
    std::fs::write(&path, bytes).map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux: o webkit2gtk pinta a janela INTEIRA de branco em várias combinações
    // de driver/compositor — o app sobe, o processo vive, e não há erro pra ler.
    // (Visto num Arch com GNOME/Wayland; o LocalAI já tinha pago o mesmo pedágio.)
    // Como o WebView é o mesmo em toda a suíte, este bloco é IDÊNTICO nos 31 apps.
    // Desliga o renderer DMABUF (suspeito nº 1), o compositing (reforço) e, em
    // Wayland, força XWayland — em AppImage o branco costuma sobreviver aos dois
    // primeiros. Custa aceleração no WebView, e branco é pior que lento.
    // Variável já setada MANDA (inclusive `=0`): quem depurou o próprio sistema
    // não pode ser sobrescrito por nós. Tem que vir ANTES do GTK subir — o
    // webkitgtk lê estas variáveis uma vez só, no arranque.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        let on_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|t| t.eq_ignore_ascii_case("wayland"))
                .unwrap_or(false);
        if on_wayland && std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    tauri::Builder::default()
        // single-instance must be registered first: a 2nd launch (e.g. "open with")
        // forwards the file path to the running window instead of starting a new app.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(llm::LlmState::default()))
        .invoke_handler(tauri::generate_handler![
            get_startup_file,
            read_file_base64,
            write_file_base64,
            llm::list_models,
            llm::start_llm,
            llm::stop_llm,
            llm::llm_status,
        ])
        .on_window_event(|window, event| {
            // mata o sidecar da IA junto com a janela (senão fica um llama-server órfão)
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<Mutex<llm::LlmState>>();
                let mut guard = match state.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if let Some(child) = guard.child.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                guard.child = None;
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
