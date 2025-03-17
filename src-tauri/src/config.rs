use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::api::path::app_config_dir;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub notion_api_token: String,
    pub selected_page_id: String,
    pub selected_page_title: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            notion_api_token: String::new(),
            selected_page_id: String::new(),
            selected_page_title: String::new(),
        }
    }
}

impl AppConfig {
    pub fn load() -> Result<Self, String> {
        let config_path = get_config_path()?;
        
        if !config_path.exists() {
            return Ok(AppConfig::default());
        }
        
        let config_str = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
            
        serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }
    
    pub fn save(&self) -> Result<(), String> {
        let config_path = get_config_path()?;
        
        // Create parent directories if they don't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
        
        let config_str = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
            
        fs::write(&config_path, config_str)
            .map_err(|e| format!("Failed to write config file: {}", e))
    }
}

fn get_config_path() -> Result<PathBuf, String> {
    let app_config_dir = app_config_dir(&tauri::Config::default())
        .ok_or("Failed to get app config directory")?;
        
    Ok(app_config_dir.join("config.json"))
}

// Create AppState to hold the config
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
}

// Initialize the application state with the loaded config
pub fn init_app_state() -> AppState {
    let config = AppConfig::load().unwrap_or_default();
    AppState {
        config: Arc::new(Mutex::new(config)),
    }
}