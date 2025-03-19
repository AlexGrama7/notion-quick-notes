use serde::{Serialize, Deserialize};
use thiserror::Error;
use std::fmt;

/// Enhanced error types with more specific information
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Notion API error: {message}")]
    NotionApiError {
        message: String,
        status_code: Option<u16>,
        error_code: Option<String>
    },
    
    #[error("Rate limit exceeded: {message}")]
    RateLimitError {
        message: String,
        retry_after: Option<u64>,
        limit: Option<u32>,
        remaining: Option<u32>,
    },
    
    #[error("Hotkey registration error: {0}")]
    HotkeyError(String),
    
    #[error("Filesystem error: {0}")]
    FsError(String),
    
    #[error("Network error: {message}")]
    NetworkError {
        message: String,
        is_offline: bool,
    },
    
    #[error("Offline operation error: {0}")]
    OfflineError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Unknown error: {0}")]
    UnknownError(String),
}

/// Recovery actions that can be suggested to the user
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum RecoveryAction {
    Retry,             // Try the operation again
    RetryLater,        // Try again after some time
    OpenSettings,      // Open the settings panel
    CheckConnection,   // Check network connection
    CheckPageAccess,   // Verify page permissions
    Restart,           // Restart the application
    None,              // No recovery action available
}

impl fmt::Display for RecoveryAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let action_text = match self {
            RecoveryAction::Retry => "Try again",
            RecoveryAction::RetryLater => "Try again later",
            RecoveryAction::OpenSettings => "Open settings",
            RecoveryAction::CheckConnection => "Check your connection",
            RecoveryAction::CheckPageAccess => "Check page permissions",
            RecoveryAction::Restart => "Restart the application",
            RecoveryAction::None => "",
        };
        write!(f, "{}", action_text)
    }
}

/// Error severity levels
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

/// Enhanced error response with user-friendly messages and recovery actions
#[derive(Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,        // Technical message
    pub user_message: String,   // User-friendly message
    pub details: Option<String>,
    pub recovery_action: RecoveryAction,
    pub severity: ErrorSeverity,
}

impl AppError {
    /// Get a user-friendly message for this error
    pub fn user_message(&self) -> String {
        match self {
            AppError::ConfigError(msg) => {
                if msg.contains("not found") {
                    "The configuration file could not be found. The app will use default settings.".to_string()
                } else if msg.contains("permission") {
                    "Cannot access the configuration file due to permission issues.".to_string()
                } else {
                    "There's an issue with your app configuration.".to_string()
                }
            },
            AppError::NotionApiError { message, status_code, .. } => {
                match status_code {
                    Some(401) => "Your Notion API token appears to be invalid or expired. Please update it in Settings.".to_string(),
                    Some(403) => "You don't have permission to access this Notion page. Make sure you've shared it with your integration.".to_string(),
                    Some(404) => "The Notion page could not be found. It may have been deleted or moved.".to_string(),
                    Some(429) => "You've hit Notion's rate limit. Please wait a moment before trying again.".to_string(),
                    Some(500..=599) => "Notion's servers are having issues. Please try again later.".to_string(),
                    _ => {
                        if message.contains("token") {
                            "There's an issue with your Notion API token.".to_string()
                        } else if message.contains("page") {
                            "There's an issue with the selected Notion page.".to_string()
                        } else {
                            "There was a problem communicating with Notion.".to_string()
                        }
                    }
                }
            },
            AppError::RateLimitError { message, retry_after, .. } => {
                if let Some(seconds) = retry_after {
                    if *seconds < 60 {
                        format!("You've reached Notion's rate limit. Please try again in {} seconds.", *seconds)
                    } else if *seconds < 3600 {
                        let minutes = (*seconds + 59) / 60; // Round up
                        format!("You've reached Notion's rate limit. Please try again in {} minute{}.",
                            minutes,
                            if minutes == 1 { "" } else { "s" })
                    } else {
                        let hours = (*seconds + 3599) / 3600; // Round up
                        format!("You've reached Notion's rate limit. Please try again in {} hour{}.",
                            hours,
                            if hours == 1 { "" } else { "s" })
                    }
                } else {
                    message.to_string()
                }
            },
            AppError::HotkeyError(msg) => {
                if msg.contains("already registered") {
                    "The keyboard shortcut is already in use by another application.".to_string()
                } else {
                    "Could not register the keyboard shortcut. It may be in use by another application.".to_string()
                }
            },
            AppError::FsError(msg) => {
                if msg.contains("permission") {
                    "The app doesn't have permission to access a required file.".to_string()
                } else if msg.contains("not found") {
                    "A required file could not be found.".to_string()
                } else {
                    "There was a problem accessing a file on your system.".to_string()
                }
            },
            AppError::NetworkError { is_offline, .. } => {
                if *is_offline {
                    "You're currently offline. Connect to the internet and try again.".to_string()
                } else {
                    "There's a problem with your internet connection. Check your connection and try again.".to_string()
                }
            },
            AppError::OfflineError(_) => {
                "This action can't be completed while offline. Your note will be saved and synced when you're back online.".to_string()
            },
            AppError::ValidationError(msg) => {
                if msg.contains("empty") {
                    "The note is empty. Please enter some text before saving.".to_string()
                } else {
                    "There was a problem with the data you entered.".to_string()
                }
            },
            AppError::UnknownError(_) => {
                "An unexpected error occurred. If this persists, please restart the application.".to_string()
            },
        }
    }
    
    /// Get the recommended recovery action for this error
    pub fn recovery_action(&self) -> RecoveryAction {
        match self {
            AppError::ConfigError(_) => RecoveryAction::OpenSettings,
            AppError::NotionApiError { status_code, .. } => {
                match status_code {
                    Some(401) | Some(403) => RecoveryAction::OpenSettings,
                    Some(404) => RecoveryAction::OpenSettings,
                    Some(429) => RecoveryAction::RetryLater,
                    Some(500..=599) => RecoveryAction::RetryLater,
                    _ => RecoveryAction::OpenSettings,
                }
            },
            AppError::RateLimitError { .. } => RecoveryAction::RetryLater,
            AppError::HotkeyError(_) => RecoveryAction::OpenSettings,
            AppError::FsError(_) => RecoveryAction::Restart,
            AppError::NetworkError { is_offline, .. } => {
                if *is_offline {
                    RecoveryAction::CheckConnection
                } else {
                    RecoveryAction::Retry
                }
            },
            AppError::OfflineError(_) => RecoveryAction::None,
            AppError::ValidationError(_) => RecoveryAction::None,
            AppError::UnknownError(_) => RecoveryAction::Restart,
        }
    }
    
    /// Get the severity level of this error
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            AppError::ConfigError(_) => ErrorSeverity::Warning,
            AppError::NotionApiError { status_code, .. } => {
                match status_code {
                    Some(401) | Some(403) | Some(404) => ErrorSeverity::Error,
                    Some(429) => ErrorSeverity::Warning,
                    Some(500..=599) => ErrorSeverity::Warning,
                    _ => ErrorSeverity::Error,
                }
            },
            AppError::RateLimitError { .. } => ErrorSeverity::Warning,
            AppError::HotkeyError(_) => ErrorSeverity::Warning,
            AppError::FsError(_) => ErrorSeverity::Error,
            AppError::NetworkError { is_offline, .. } => {
                if *is_offline {
                    ErrorSeverity::Info
                } else {
                    ErrorSeverity::Warning
                }
            },
            AppError::OfflineError(_) => ErrorSeverity::Info,
            AppError::ValidationError(_) => ErrorSeverity::Info,
            AppError::UnknownError(_) => ErrorSeverity::Critical,
        }
    }
}

impl From<AppError> for ErrorResponse {
    fn from(error: AppError) -> Self {
        // Determine the error code based on the type
        let code = match &error {
            AppError::ConfigError(_) => "CONFIG_ERROR".to_string(),
            
            AppError::NotionApiError { status_code, error_code, .. } => {
                if let Some(status) = status_code {
                    match status {
                        401 => "NOTION_AUTH_ERROR".to_string(),
                        403 => "NOTION_PERMISSION_ERROR".to_string(),
                        404 => "NOTION_NOT_FOUND".to_string(),
                        429 => "NOTION_RATE_LIMIT".to_string(),
                        500..=599 => "NOTION_SERVER_ERROR".to_string(),
                        _ => error_code.clone().unwrap_or_else(|| "NOTION_API_ERROR".to_string()),
                    }
                } else {
                    "NOTION_API_ERROR".to_string()
                }
            },
            
            AppError::RateLimitError { .. } => "RATE_LIMIT_ERROR".to_string(),
            
            AppError::HotkeyError(_) => "HOTKEY_ERROR".to_string(),
            
            AppError::FsError(_) => "FILESYSTEM_ERROR".to_string(),
            
            AppError::NetworkError { is_offline, .. } => {
                if *is_offline {
                    "OFFLINE_ERROR".to_string()
                } else {
                    "NETWORK_ERROR".to_string()
                }
            },
            
            AppError::OfflineError(_) => "OFFLINE_OPERATION_ERROR".to_string(),
            
            AppError::ValidationError(_) => "VALIDATION_ERROR".to_string(),
            
            AppError::UnknownError(_) => "UNKNOWN_ERROR".to_string(),
        };
        
        // Create the error response
        ErrorResponse {
            code,
            message: error.to_string(),
            user_message: error.user_message(),
            details: None,
            recovery_action: error.recovery_action(),
            severity: error.severity(),
        }
    }
}

/// Function to convert standard errors to AppError
pub fn map_error<E: std::error::Error>(err: E, error_type: &str) -> AppError {
    match error_type {
        "config" => AppError::ConfigError(err.to_string()),
        "notion" => {
            let msg = err.to_string();
            let status_code = if msg.contains("status code: 401") {
                Some(401)
            } else if msg.contains("status code: 403") {
                Some(403)
            } else if msg.contains("status code: 404") {
                Some(404)
            } else if msg.contains("status code: 429") {
                Some(429)
            } else if msg.contains("status code: 5") {
                Some(500)
            } else {
                None
            };
            
            AppError::NotionApiError {
                message: msg,
                status_code,
                error_code: None,
            }
        },
        "hotkey" => AppError::HotkeyError(err.to_string()),
        "fs" => AppError::FsError(err.to_string()),
        "network" => {
            let msg = err.to_string();
            let is_offline = !navigator_online();
            
            AppError::NetworkError {
                message: msg,
                is_offline,
            }
        },
        "validation" => AppError::ValidationError(err.to_string()),
        "offline" => AppError::OfflineError(err.to_string()),
        _ => AppError::UnknownError(err.to_string()),
    }
}

/// Helper function to check if navigator is online (always returns true in Rust context)
fn navigator_online() -> bool {
    // In a real implementation, you'd use the window.navigator.onLine value from the JS context
    // For Rust, we're assuming online for safety, but this would need to be properly implemented
    // with the JS side integration
    true
}

/// Log an error to the console with structured information
pub fn log_error(error: &AppError, location: &str) {
    let severity = match error.severity() {
        ErrorSeverity::Info => "INFO",
        ErrorSeverity::Warning => "WARNING",
        ErrorSeverity::Error => "ERROR",
        ErrorSeverity::Critical => "CRITICAL",
    };
    
    println!("[{}] {} at {}: {}", severity, std::any::type_name::<AppError>(), location, error);
    
    // In a production app, you might want to log to a file or telemetry service
}