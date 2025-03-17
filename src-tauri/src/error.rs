use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Notion API error: {0}")]
    NotionApiError(String),
    
    #[error("Hotkey registration error: {0}")]
    HotkeyError(String),
    
    #[error("Filesystem error: {0}")]
    FsError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Unknown error: {0}")]
    UnknownError(String),
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

impl From<AppError> for ErrorResponse {
    fn from(error: AppError) -> Self {
        let (code, details) = match &error {
            AppError::ConfigError(_) => ("CONFIG_ERROR", None),
            AppError::NotionApiError(msg) => {
                if msg.contains("rate limit") {
                    ("NOTION_RATE_LIMIT", Some("Please try again later.".into()))
                } else if msg.contains("unauthorized") {
                    ("NOTION_AUTH_ERROR", Some("Please check your API token.".into()))
                } else {
                    ("NOTION_API_ERROR", None)
                }
            },
            AppError::HotkeyError(_) => ("HOTKEY_ERROR", None),
            AppError::FsError(_) => ("FILESYSTEM_ERROR", None),
            AppError::NetworkError(_) => ("NETWORK_ERROR", Some("Please check your internet connection.".into())),
            AppError::UnknownError(_) => ("UNKNOWN_ERROR", None),
        };
        
        ErrorResponse {
            code: code.to_string(),
            message: error.to_string(),
            details,
        }
    }
}

// Function to convert standard errors to AppError
pub fn map_error<E: std::error::Error>(err: E, error_type: &str) -> AppError {
    match error_type {
        "config" => AppError::ConfigError(err.to_string()),
        "notion" => AppError::NotionApiError(err.to_string()),
        "hotkey" => AppError::HotkeyError(err.to_string()),
        "fs" => AppError::FsError(err.to_string()),
        "network" => AppError::NetworkError(err.to_string()),
        _ => AppError::UnknownError(err.to_string()),
    }
}