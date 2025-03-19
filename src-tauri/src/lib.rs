use tauri::{AppHandle, Manager, GlobalShortcutManager};

// Module imports
pub mod config;
pub mod notion;
pub mod error;
pub mod rate_limit;

use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

// Rate limit information returned to the frontend
#[derive(Serialize)]
pub struct RateLimitInfo {
    limit: Option<u64>,
    remaining: Option<u64>,
    reset_at: Option<u64>,
    is_limited: bool,
    retry_after: Option<u64>,
}

// Function that provides rate limit information without being a Tauri command
pub fn fetch_rate_limit_info(state: &tauri::State<config::AppState>) -> Result<RateLimitInfo, error::ErrorResponse> {
    let config = state.config.lock().unwrap();
    let api_token = &config.notion_api_token;
    
    // Get the rate limit manager
    let rate_limit_manager = rate_limit::RateLimitManager::instance();
    
    // Check if we're currently rate limited
    let is_limited = !rate_limit_manager.should_allow_request(api_token);
    
    // Get the recommended delay if we're limited
    let retry_after = if is_limited {
        let delay = rate_limit_manager.get_recommended_delay(api_token);
        if !delay.is_zero() {
            Some(delay.as_secs())
        } else {
            None
        }
    } else {
        None
    };
    
    // Get the current rate limit state if available
    let state = rate_limit_manager.get_state(api_token);
    
    // Calculate the current Unix timestamp
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // Calculate reset time as a Unix timestamp
    let reset_at = state.as_ref().and_then(|s| {
        s.time_until_reset().map(|secs| now + secs)
    });
    
    Ok(RateLimitInfo {
        limit: state.as_ref().and_then(|s| s.limit.map(|v| v as u64)),
        remaining: state.as_ref().and_then(|s| s.remaining.map(|v| v as u64)),
        reset_at,
        is_limited,
        retry_after,
    })
}

// Function to check if settings are configured before showing the note input
pub fn check_settings_configured(app: &AppHandle) -> bool {
    let state = app.state::<config::AppState>();
    let config = state.config.lock().unwrap();
    
    // Check if API token and page ID are set
    !config.notion_api_token.is_empty() && !config.selected_page_id.is_empty()
}

// Function to show the note input window
pub fn show_note_input(app: AppHandle) {
    // Check if settings are configured
    if !check_settings_configured(&app) {
        // If not configured, show settings window instead
        show_settings(app);
        return;
    }
    
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
        .inner_size(600.0, 80.0) // Extremely wide and very short
        .min_inner_size(600.0, 80.0) // Force minimum size to be the same
        .max_inner_size(600.0, 80.0) // Force maximum size to be the same
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

// Function to close the settings window
pub fn close_settings(app: AppHandle) {
    if let Some(window) = app.get_window("settings") {
        window.hide().unwrap();
    }
}

// Function to show the settings window
pub fn show_settings(app: AppHandle) {
    println!("Attempting to show settings window");
    
    // Check if a window with this label already exists
    if let Some(existing_window) = app.get_window("settings") {
        println!("Found existing settings window");
        
        // Instead of closing, navigate to a fresh URL with timestamp to reset state
        let fresh_url = format!("index.html?settings=true&t={}", chrono::Utc::now().timestamp_millis());
        
        if let Err(e) = existing_window.eval(&format!("window.location.replace('{}')", fresh_url)) {
            eprintln!("Failed to navigate settings window: {}", e);
        }
        
        // Show and focus the window
        if let Err(e) = existing_window.show() {
            eprintln!("Failed to show settings window: {}", e);
        }
        if let Err(e) = existing_window.set_focus() {
            eprintln!("Failed to focus settings window: {}", e);
        }
    } else {
        // Create a new window only if one doesn't exist
        println!("Creating new settings window");
        match tauri::WindowBuilder::new(
            &app,
            "settings",
            tauri::WindowUrl::App(format!("index.html?settings=true&t={}", chrono::Utc::now().timestamp_millis()).into())
        )
        .title("Notion Quick Notes - Settings")
        .inner_size(500.0, 580.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build() {
            Ok(_) => {
                println!("Settings window created successfully");
                if let Some(window) = app.get_window("settings") {
                    if let Err(e) = window.show() {
                        eprintln!("Failed to show settings window: {}", e);
                    }
                    if let Err(e) = window.set_focus() {
                        eprintln!("Failed to focus settings window: {}", e);
                    }
                }
            },
            Err(e) => eprintln!("Failed to create settings window: {}", e),
        }
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
