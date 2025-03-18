// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notion_quick_notes::config;
use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, Manager};

// Define the commands with tauri::command attribute
#[tauri::command]
fn show_note_input(app: tauri::AppHandle) {
    notion_quick_notes::show_note_input(app);
}

#[tauri::command]
fn close_note_input(app: tauri::AppHandle) {
    notion_quick_notes::close_note_input(app);
}

#[tauri::command]
fn show_settings(app: tauri::AppHandle) {
    notion_quick_notes::show_settings(app);
}

#[tauri::command]
fn close_settings(app: tauri::AppHandle) {
    notion_quick_notes::close_settings(app);
}

fn main() {
    // Initialize app state
    let app_state = config::init_app_state();

    // Create system tray menu
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("settings".to_string(), "Settings"))
        .add_item(CustomMenuItem::new("about".to_string(), "About"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit".to_string(), "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            show_note_input,
            close_note_input,
            show_settings,
            close_settings,
            notion_quick_notes::notion::get_notion_api_token,
            notion_quick_notes::notion::set_notion_api_token,
            notion_quick_notes::notion::search_notion_pages,
            notion_quick_notes::notion::get_selected_page_id,
            notion_quick_notes::notion::set_selected_page_id,
            notion_quick_notes::notion::append_note,
        ])
        .setup(|app| {
            let app_handle = app.handle();
            
            notion_quick_notes::register_global_hotkey(app_handle);
            Ok(())
        })
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "settings" => {
                        println!("Opening settings from system tray");
                        
                        // Hide the note input window if visible
                        if let Some(window) = app.get_window("main") {
                            let _ = window.hide();
                        }
                        
                        // Show settings window (will reuse if exists)
                        notion_quick_notes::show_settings(app.app_handle());
                    }
                    "about" => {
                        let _ = tauri::WindowBuilder::new(
                            app,
                            "about",
                            tauri::WindowUrl::App("index.html?about=true".into()),
                        )
                        .title("About Notion Quick Notes")
                        .resizable(false)
                        .inner_size(600.0, 600.0)
                        .center()
                        .build();
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
