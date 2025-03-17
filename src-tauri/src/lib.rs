use tauri::{AppHandle, Manager, GlobalShortcutManager};

// Module imports
pub mod config;
pub mod notion;
pub mod error;

// Function to show the note input window
pub fn show_note_input(app: AppHandle) {
    if let Some(window) = app.get_window("main") {
        window.show().unwrap();
        window.set_focus().unwrap();
    } else {
        let _ = tauri::WindowBuilder::new(
            &app,
            "main", // the unique window label
            tauri::WindowUrl::App("index.html".into()),
        )
        .title("Notion Quick Notes")
        .resizable(false)
        .decorations(false)
        .center()
        .build();
    }
}

// Function to close the note input window
pub fn close_note_input(app: AppHandle) {
    if let Some(window) = app.get_window("main") {
        window.hide().unwrap();
    }
}

// Function to show the settings window
pub fn show_settings(app: AppHandle) {
    if let Some(window) = app.get_window("settings") {
        window.show().unwrap();
        window.set_focus().unwrap();
    } else {
        let _ = tauri::WindowBuilder::new(
            &app,
            "settings",
            tauri::WindowUrl::App("index.html?settings=true".into()),
        )
        .title("Notion Quick Notes - Settings")
        .resizable(true)
        .center()
        .build();
    }
}

// Register the global hotkey
pub fn register_global_hotkey(app_handle: AppHandle) {
    let app_handle_clone = app_handle.clone();
    
    app_handle.global_shortcut_manager()
        .register("Alt+Q", move || {
            show_note_input(app_handle_clone.clone());
        })
        .unwrap_or_else(|e| {
            eprintln!("Failed to register global hotkey: {}", e);
        });
}
