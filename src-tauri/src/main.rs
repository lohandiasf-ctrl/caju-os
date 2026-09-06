#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn show_voice_call_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("voice-call") {
        let _ = window.close();
    }
    let target = url.parse().map_err(|error| format!("URL de chamada inválida: {error}"))?;
    WebviewWindowBuilder::new(&app, "voice-call", WebviewUrl::External(target))
        .title("Chamada recebida · Caju OS")
        .inner_size(380.0, 280.0)
        .min_inner_size(360.0, 260.0)
        .resizable(false)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(false)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_voice_call_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("voice-call") {
        let _ = window.close();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![show_voice_call_window, close_voice_call_window])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Caju OS");
}
