#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::io::Write;
use std::process::{Command, Stdio};

#[tauri::command]
fn show_voice_call_window(app: tauri::AppHandle, _url: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Janela principal indisponível")?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Link inválido".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let is_jira = host.ends_with(".atlassian.net");
    let is_whatsapp_group = host == "chat.whatsapp.com";
    if parsed.scheme() != "https" || (!is_jira && !is_whatsapp_group) {
        return Err("Somente links seguros do Jira ou grupos do WhatsApp são permitidos".into());
    }
    #[cfg(target_os = "windows")]
    if is_whatsapp_group {
        let chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ];
        if let Some(chrome) = chrome_paths.iter().find(|path| std::path::Path::new(path).is_file()) {
            Command::new(chrome).args(["--new-tab", &url]).spawn().map_err(|error| error.to_string())?;
        } else {
            Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn().map_err(|error| error.to_string())?;
        }
    } else {
        Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<bool, String> {
    if text.trim().is_empty() || text.len() > 10_000 { return Err("Texto inválido para cópia".into()); }
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("clip").stdin(Stdio::piped()).spawn().map_err(|error| error.to_string())?;
        if let Some(mut input) = child.stdin.take() { input.write_all(text.as_bytes()).map_err(|error| error.to_string())?; }
        if !child.wait().map_err(|error| error.to_string())?.success() { return Err("Não foi possível copiar a mensagem".into()); }
        return Ok(true);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![show_voice_call_window, open_external_url, copy_to_clipboard])
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
