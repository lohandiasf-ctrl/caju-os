#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::Manager;

const MAX_CLIPBOARD_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_CLIPBOARD_TOTAL_BYTES: u64 = 50 * 1024 * 1024;
const MAX_CLIPBOARD_FILES: usize = 8;

#[derive(Serialize)]
struct ClipboardFile {
    name: String,
    mime_type: String,
    data_base64: String,
}

#[tauri::command]
fn show_voice_call_window(app: tauri::AppHandle, _url: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Janela principal indisponível")?;
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
        if let Some(chrome) = chrome_paths
            .iter()
            .find(|path| std::path::Path::new(path).is_file())
        {
            Command::new(chrome)
                .args(["--new-tab", &url])
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", &url])
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    } else {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<bool, String> {
    if text.trim().is_empty() || text.len() > 10_000 {
        return Err("Texto inválido para cópia".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("clip")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        if let Some(mut input) = child.stdin.take() {
            input
                .write_all(text.as_bytes())
                .map_err(|error| error.to_string())?;
        }
        if !child.wait().map_err(|error| error.to_string())?.success() {
            return Err("Não foi possível copiar a mensagem".into());
        }
        return Ok(true);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[tauri::command]
fn read_clipboard_files() -> Result<Vec<ClipboardFile>, String> {
    #[cfg(target_os = "windows")]
    {
        return read_windows_clipboard_files();
    }
    #[cfg(not(target_os = "windows"))]
    Ok(Vec::new())
}

#[cfg(target_os = "windows")]
fn read_windows_clipboard_files() -> Result<Vec<ClipboardFile>, String> {
    let files = read_windows_file_drop_clipboard()?;
    if !files.is_empty() {
        return Ok(files);
    }
    read_windows_virtual_file_clipboard()
}

#[cfg(target_os = "windows")]
fn read_windows_file_drop_clipboard() -> Result<Vec<ClipboardFile>, String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::path::Path;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, OpenClipboard,
    };
    use windows_sys::Win32::UI::Shell::{DragQueryFileW, HDROP};

    // CF_HDROP is the native Windows clipboard format for copied files.
    const CF_HDROP: u32 = 15;
    if unsafe { OpenClipboard(std::ptr::null_mut() as HWND) } == 0 {
        return Err("Não foi possível acessar a área de transferência do Windows.".into());
    }

    let result = (|| {
        let handle = unsafe { GetClipboardData(CF_HDROP) };
        if handle.is_null() {
            return Ok(Vec::new());
        }
        let hdrop = handle as HDROP;
        let count = unsafe { DragQueryFileW(hdrop, u32::MAX, std::ptr::null_mut(), 0) } as usize;
        if count == 0 {
            return Ok(Vec::new());
        }
        if count > MAX_CLIPBOARD_FILES {
            return Err(format!(
                "Copie no máximo {MAX_CLIPBOARD_FILES} arquivos por vez."
            ));
        }

        let mut total_bytes = 0u64;
        let mut files = Vec::with_capacity(count);
        for index in 0..count {
            let length =
                unsafe { DragQueryFileW(hdrop, index as u32, std::ptr::null_mut(), 0) } as usize;
            let mut path_buffer = vec![0u16; length + 1];
            let written = unsafe {
                DragQueryFileW(
                    hdrop,
                    index as u32,
                    path_buffer.as_mut_ptr(),
                    path_buffer.len() as u32,
                )
            } as usize;
            let path_string = OsString::from_wide(&path_buffer[..written]);
            let path = Path::new(&path_string);
            let metadata = std::fs::metadata(path)
                .map_err(|_| format!("Não foi possível ler {}.", path.display()))?;
            if !metadata.is_file() {
                continue;
            }
            let size = metadata.len();
            if size > MAX_CLIPBOARD_FILE_BYTES {
                return Err(format!(
                    "{} excede o limite de 25 MB.",
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("Arquivo")
                ));
            }
            total_bytes += size;
            if total_bytes > MAX_CLIPBOARD_TOTAL_BYTES {
                return Err("Os arquivos copiados excedem o limite total de 50 MB.".into());
            }
            let bytes = std::fs::read(path)
                .map_err(|_| format!("Não foi possível ler {}.", path.display()))?;
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("evidencia")
                .to_string();
            files.push(ClipboardFile {
                mime_type: mime_type_for_name(&name).to_string(),
                name,
                data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            });
        }
        Ok(files)
    })();

    unsafe {
        CloseClipboard();
    }
    result
}

#[cfg(target_os = "windows")]
fn read_windows_virtual_file_clipboard() -> Result<Vec<ClipboardFile>, String> {
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Ole::OleGetClipboard;

    let init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let should_uninitialize = init_result.is_ok();
    if init_result.is_err() && init_result != RPC_E_CHANGED_MODE {
        return Err("Não foi possível iniciar leitura avançada da área de transferência.".into());
    }

    let result = (|| {
        let data_object = unsafe { OleGetClipboard() }
            .map_err(|_| "Não foi possível ler arquivos virtuais do Windows.".to_string())?;
        read_virtual_files_from_data_object(&data_object)
    })();

    if should_uninitialize {
        unsafe {
            CoUninitialize();
        }
    }
    result
}

#[cfg(target_os = "windows")]
fn read_virtual_files_from_data_object(
    data_object: &windows::Win32::System::Com::IDataObject,
) -> Result<Vec<ClipboardFile>, String> {
    use windows::Win32::System::Com::{DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL, TYMED_ISTREAM};
    use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
    use windows::Win32::System::Ole::ReleaseStgMedium;
    use windows::Win32::UI::Shell::{CFSTR_FILECONTENTS, CFSTR_FILEDESCRIPTORW};

    let descriptor_format = unsafe { RegisterClipboardFormatW(CFSTR_FILEDESCRIPTORW) };
    let contents_format = unsafe { RegisterClipboardFormatW(CFSTR_FILECONTENTS) };
    if descriptor_format == 0 || contents_format == 0 {
        return Ok(Vec::new());
    }

    let mut descriptor_medium = unsafe {
        data_object.GetData(&FORMATETC {
            cfFormat: descriptor_format as u16,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        })
    }
    .map_err(|_| "Nenhum arquivo virtual encontrado na área de transferência.".to_string())?;

    let descriptors = read_file_group_descriptor(&descriptor_medium)?;
    unsafe {
        ReleaseStgMedium(&mut descriptor_medium);
    }

    if descriptors.is_empty() {
        return Ok(Vec::new());
    }
    if descriptors.len() > MAX_CLIPBOARD_FILES {
        return Err(format!(
            "Copie no máximo {MAX_CLIPBOARD_FILES} arquivos por vez."
        ));
    }

    let mut total_bytes = 0u64;
    let mut files = Vec::with_capacity(descriptors.len());
    for (index, descriptor) in descriptors.into_iter().enumerate() {
        let mut content_medium = unsafe {
            data_object.GetData(&FORMATETC {
                cfFormat: contents_format as u16,
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: index as i32,
                tymed: (TYMED_ISTREAM.0 | TYMED_HGLOBAL.0) as u32,
            })
        }
        .map_err(|_| {
            format!(
                "Não foi possível ler {} do arquivo compactado.",
                descriptor.name
            )
        })?;

        let bytes_result = read_stgmedium_bytes(&content_medium, descriptor.size);
        unsafe {
            ReleaseStgMedium(&mut content_medium);
        }
        let bytes = bytes_result?;
        let size = bytes.len() as u64;
        if size > MAX_CLIPBOARD_FILE_BYTES {
            return Err(format!("{} excede o limite de 25 MB.", descriptor.name));
        }
        total_bytes += size;
        if total_bytes > MAX_CLIPBOARD_TOTAL_BYTES {
            return Err("Os arquivos copiados excedem o limite total de 50 MB.".into());
        }
        files.push(ClipboardFile {
            mime_type: mime_type_for_name(&descriptor.name).to_string(),
            name: descriptor.name,
            data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Ok(files)
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
struct VirtualFileDescriptor {
    name: String,
    size: u64,
}

#[cfg(target_os = "windows")]
fn read_file_group_descriptor(
    medium: &windows::Win32::System::Com::STGMEDIUM,
) -> Result<Vec<VirtualFileDescriptor>, String> {
    use std::mem::size_of;
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::UI::Shell::FILEDESCRIPTORW;

    let hglobal = unsafe { medium.u.hGlobal };
    if hglobal.is_invalid() {
        return Ok(Vec::new());
    }
    let size = unsafe { GlobalSize(hglobal) };
    let pointer = unsafe { GlobalLock(hglobal) };
    if pointer.is_null() {
        return Err("Não foi possível abrir descritores dos arquivos compactados.".into());
    }

    let result = (|| {
        if size < 4 {
            return Ok(Vec::new());
        }
        let base = pointer as *const u8;
        let count = unsafe { std::ptr::read_unaligned(base as *const u32) } as usize;
        let descriptor_size = size_of::<FILEDESCRIPTORW>();
        if count == 0 || size < 4 + count * descriptor_size {
            return Ok(Vec::new());
        }
        let mut descriptors = Vec::with_capacity(count);
        for index in 0..count {
            let descriptor_pointer =
                unsafe { base.add(4 + index * descriptor_size) as *const FILEDESCRIPTORW };
            let descriptor = unsafe { std::ptr::read_unaligned(descriptor_pointer) };
            let filename: [u16; 260] =
                unsafe { std::ptr::read_unaligned(std::ptr::addr_of!(descriptor.cFileName)) };
            let end = filename
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(filename.len());
            let name = String::from_utf16_lossy(&filename[..end]);
            if name.trim().is_empty() {
                continue;
            }
            let size_high =
                unsafe { std::ptr::read_unaligned(std::ptr::addr_of!(descriptor.nFileSizeHigh)) };
            let size_low =
                unsafe { std::ptr::read_unaligned(std::ptr::addr_of!(descriptor.nFileSizeLow)) };
            let size = ((size_high as u64) << 32) | size_low as u64;
            descriptors.push(VirtualFileDescriptor { name, size });
        }
        Ok(descriptors)
    })();

    let _ = unsafe { GlobalUnlock(hglobal) };
    result
}

#[cfg(target_os = "windows")]
fn read_stgmedium_bytes(
    medium: &windows::Win32::System::Com::STGMEDIUM,
    expected_size: u64,
) -> Result<Vec<u8>, String> {
    use std::mem::ManuallyDrop;
    use windows::Win32::System::Com::{IStream, TYMED_HGLOBAL, TYMED_ISTREAM};
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    if medium.tymed == TYMED_HGLOBAL.0 as u32 {
        let hglobal = unsafe { medium.u.hGlobal };
        if hglobal.is_invalid() {
            return Ok(Vec::new());
        }
        let size = unsafe { GlobalSize(hglobal) };
        let pointer = unsafe { GlobalLock(hglobal) };
        if pointer.is_null() {
            return Err("Não foi possível abrir conteúdo do arquivo compactado.".into());
        }
        let bytes = unsafe { std::slice::from_raw_parts(pointer as *const u8, size).to_vec() };
        let _ = unsafe { GlobalUnlock(hglobal) };
        return Ok(bytes);
    }

    if medium.tymed == TYMED_ISTREAM.0 as u32 {
        let stream_option: Option<IStream> = unsafe {
            let stream_pointer = &medium.u.pstm as *const ManuallyDrop<Option<IStream>>;
            (&*(stream_pointer as *const Option<IStream>)).clone()
        };
        let stream =
            stream_option.ok_or_else(|| "Fluxo do arquivo compactado indisponível.".to_string())?;
        return read_stream_bytes(&stream, expected_size);
    }

    Err("Formato de arquivo compactado não suportado pelo Windows.".into())
}

#[cfg(target_os = "windows")]
fn read_stream_bytes(
    stream: &windows::Win32::System::Com::IStream,
    expected_size: u64,
) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::STREAM_SEEK_SET;

    unsafe { stream.Seek(0, STREAM_SEEK_SET, None) }
        .map_err(|_| "Não foi possível posicionar leitura do arquivo compactado.".to_string())?;

    let mut bytes = Vec::with_capacity(expected_size.min(MAX_CLIPBOARD_FILE_BYTES) as usize);
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let mut read = 0u32;
        let hr = unsafe {
            stream.Read(
                buffer.as_mut_ptr() as *mut core::ffi::c_void,
                buffer.len() as u32,
                Some(&mut read),
            )
        };
        if hr.is_err() {
            return Err("Falha ao ler conteúdo do arquivo compactado.".into());
        }
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read as usize]);
        if bytes.len() as u64 > MAX_CLIPBOARD_FILE_BYTES {
            return Err("Arquivo compactado excede o limite de 25 MB.".into());
        }
        if bytes.len() as u64 > MAX_CLIPBOARD_TOTAL_BYTES {
            return Err("Arquivos compactados excedem o limite total de 50 MB.".into());
        }
    }
    Ok(bytes)
}

fn mime_type_for_name(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("heic") => "image/heic",
        Some("mp4") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        Some("avi") => "video/x-msvideo",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("rar") => "application/x-rar-compressed",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("csv") => "text/csv",
        Some("txt") => "text/plain",
        _ => "application/octet-stream",
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            show_voice_call_window,
            open_external_url,
            copy_to_clipboard,
            read_clipboard_files
        ])
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
