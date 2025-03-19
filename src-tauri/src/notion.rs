use reqwest::{Client, header, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use chrono::{Local, Timelike, Datelike};
use std::sync::{Mutex, Arc};
use std::collections::HashMap;
use std::time::{Duration, Instant};
// Removed unused import: use tokio::time::sleep;

use crate::config::AppState;
use crate::rate_limit::{RateLimitManager, extract_rate_limit_headers};
// Removed unused import: use crate::error::AppError;

// Notion page representation
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotionPage {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub url: String,
}

// Cache structure with expiration time
struct CacheEntry<T> {
    data: T,
    expires_at: Instant,
}

// Global cache for API responses
lazy_static::lazy_static! {
    static ref PAGES_CACHE: Mutex<Option<CacheEntry<Vec<NotionPage>>>> = Mutex::new(None);
    static ref CLIENT_POOL: Arc<Mutex<HashMap<String, Client>>> = Arc::new(Mutex::new(HashMap::new()));
}

// Cache duration (5 minutes)
const CACHE_DURATION: Duration = Duration::from_secs(300);

// Notion API client
struct NotionApiClient {
    client: Client,
    api_token: String, 
}

impl NotionApiClient {
    pub fn new(api_token: String) -> Result<Self, crate::error::AppError> {
        // Try to get a client from the pool first
        {
            let client_pool = CLIENT_POOL.lock().unwrap();
            if let Some(client) = client_pool.get(&api_token) {
                return Ok(NotionApiClient {
                    client: client.clone(),
                    api_token: api_token.clone(),
                });
            }
        }
        
        // Create a new client if none exists in the pool
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            header::HeaderValue::from_str(&format!("Bearer {}", api_token))
                .map_err(|e| crate::error::AppError::NotionApiError {
                    message: format!("Invalid API token: {}", e),
                    status_code: None,
                    error_code: None,
                })?
        );
        headers.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json")
        );
        headers.insert(
            "Notion-Version",
            header::HeaderValue::from_static("2022-06-28")
        );
        
        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(10)) // Add timeout for better error handling
            .build()
            .map_err(|e| crate::error::AppError::NotionApiError {
                message: format!("Failed to create HTTP client: {}", e),
                status_code: None,
                error_code: None,
            })?;
        
        // Store the client in the pool
        {
            let mut client_pool = CLIENT_POOL.lock().unwrap();
            client_pool.insert(api_token.clone(), client.clone());
        }
            
        Ok(NotionApiClient {
            client,
            api_token,
        })
    }
    
    /// Check if we're currently rate limited and wait if necessary
    async fn check_rate_limit(&self) -> Result<(), crate::error::AppError> {
        let rate_limit_manager = RateLimitManager::instance();
        
        // Check if we should allow the request
        if !rate_limit_manager.should_allow_request(&self.api_token) {
            let delay = rate_limit_manager.get_recommended_delay(&self.api_token);
            
            // If we need to wait, convert to a rate limit error
            if !delay.is_zero() {
                let seconds = delay.as_secs();
                
                // Get state information once
                if let Some(state) = rate_limit_manager.get_state(&self.api_token) {
                    return Err(crate::error::AppError::RateLimitError {
                        message: format!("Rate limit in effect, retry after {} seconds", seconds),
                        retry_after: Some(seconds),
                        limit: state.limit,
                        remaining: state.remaining,
                    });
                } else {
                    // Fallback if no state is available
                    return Err(crate::error::AppError::RateLimitError {
                        message: format!("Rate limit in effect, retry after {} seconds", seconds),
                        retry_after: Some(seconds),
                        limit: None,
                        remaining: None,
                    });
                }
            }
        }
        
        Ok(())
    }
    
    /// Process response to extract rate limit information
    fn process_response_headers(&self, response: &Response) {
        let rate_limit_manager = RateLimitManager::instance();
        let headers = response.headers();
        
        // Extract rate limit information from headers
        let (reset, remaining, limit) = extract_rate_limit_headers(headers);
        
        // Record successful request in rate limit manager
        rate_limit_manager.record_success(&self.api_token);
        
        // Update rate limit information if available
        if reset.is_some() || remaining.is_some() || limit.is_some() {
            println!("Updated rate limit info: reset={:?}, remaining={:?}, limit={:?}",
                reset, remaining, limit);
        }
    }
    
    /// Handle rate limited response (HTTP 429)
    fn handle_rate_limit(&self, response: &Response) -> crate::error::AppError {
        let rate_limit_manager = RateLimitManager::instance();
        let headers = response.headers();
        
        // Extract rate limit information
        let (reset, remaining, limit) = extract_rate_limit_headers(headers);
        
        // Record rate limit in the manager
        rate_limit_manager.record_rate_limit(&self.api_token, reset, remaining, limit);
        
        // Return a rate limit error
        crate::error::AppError::RateLimitError {
            message: "You've reached Notion's API rate limit.".to_string(),
            retry_after: reset,
            limit,
            remaining,
        }
    }
    
    pub async fn verify_token(&self) -> Result<bool, crate::error::AppError> {
        // Check if we're currently rate limited and wait if necessary
        self.check_rate_limit().await?;
        
        // Make the request
        let res = self.client
            .get("https://api.notion.com/v1/users/me")
            .send()
            .await
            .map_err(|e| crate::error::AppError::NetworkError {
                message: format!("API request failed: {}", e),
                is_offline: false
            })?;
        
        // Handle rate limiting
        if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(self.handle_rate_limit(&res));
        }
            
        if !res.status().is_success() {
            return Err(crate::error::AppError::NotionApiError {
                message: format!("API token validation failed with status: {}", res.status()),
                status_code: Some(res.status().as_u16()),
                error_code: None
            });
        }
        
        // Process response headers to extract rate limit information
        self.process_response_headers(&res);
        
        Ok(res.status().is_success())
    }
    
    pub async fn search_pages(&self) -> Result<Vec<NotionPage>, crate::error::AppError> {
        // Check cache first
        {
            let cache = PAGES_CACHE.lock().unwrap();
            if let Some(entry) = &*cache {
                if Instant::now() < entry.expires_at {
                    return Ok(entry.data.clone());
                }
            }
        }
        
        // Check if we're currently rate limited before making the API call
        self.check_rate_limit().await?;
        
        // Cache miss or expired, fetch from API
        let search_body = json!({
            "filter": {
                "value": "page",
                "property": "object"
            },
            "sort": {
                "direction": "descending",
                "timestamp": "last_edited_time"
            }
        });
        
        let res = self.client
            .post("https://api.notion.com/v1/search")
            .json(&search_body)
            .send()
            .await
            .map_err(|e| crate::error::AppError::NetworkError {
                message: format!("API request failed: {}", e),
                is_offline: false
            })?;
            
        // Handle rate limiting
        if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(self.handle_rate_limit(&res));
        }
        
        if !res.status().is_success() {
            return Err(crate::error::AppError::NotionApiError {
                message: format!("API error: {}", res.status()),
                status_code: Some(res.status().as_u16()),
                error_code: None
            });
        }
        
        // Process response headers to extract rate limit information
        self.process_response_headers(&res);
        
        let search_result: serde_json::Value = res.json()
            .await
            .map_err(|e| crate::error::AppError::NotionApiError {
                message: format!("Failed to parse response: {}", e),
                status_code: None,
                error_code: None
            })?;
            
        // Get results array, handling the error explicitly
        let results_array = match search_result["results"].as_array() {
            Some(array) => array,
            None => {
                return Err(crate::error::AppError::NotionApiError {
                    message: "Invalid response format: missing results array".to_string(),
                    status_code: None,
                    error_code: None,
                });
            }
        };
        
        let pages: Vec<NotionPage> = results_array
            .iter()
            .filter_map(|page| {
                // Extract page title from various possible properties
                if let Some(props) = page["properties"].as_object() {
                    // Try to find title in properties
                    for (_, prop) in props {
                        if let Some(title_content) = prop.get("title") {
                            if let Some(title_array) = title_content.as_array() {
                                if let Some(first_title) = title_array.first() {
                                    if let Some(text) = first_title.get("text") {
                                        if let Some(content) = text.get("content") {
                                            if let Some(content_str) = content.as_str() {
                                                return Some(NotionPage {
                                                    id: page["id"].as_str().unwrap_or("").to_string(),
                                                    title: content_str.to_string(),
                                                    icon: page["icon"]["emoji"].as_str().map(|s| s.to_string()),
                                                    url: page["url"].as_str().unwrap_or("").to_string(),
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Fallback to title from parent
                if let Some(title) = page["parent"]["page"]["title"].as_str() {
                    return Some(NotionPage {
                        id: page["id"].as_str().unwrap_or("").to_string(),
                        title: title.to_string(),
                        icon: page["icon"]["emoji"].as_str().map(|s| s.to_string()),
                        url: page["url"].as_str().unwrap_or("").to_string(),
                    });
                }
                
                None
            })
            .collect();
        
        // Update cache with new data
        {
            let mut cache = PAGES_CACHE.lock().unwrap();
            *cache = Some(CacheEntry {
                data: pages.clone(),
                expires_at: Instant::now() + CACHE_DURATION,
            });
        }
            
        Ok(pages)
    }
    
    pub async fn append_note_to_page(
        &self,
        page_id: &str,
        note_text: &str
    ) -> Result<(), crate::error::AppError> {
        // Check if we're currently rate limited and wait if necessary
        self.check_rate_limit().await?;
        
        // Debug logging for text flow
        println!("BACKEND - Received note text: {}", note_text);
        println!("BACKEND - Text length: {}", note_text.len());
        if !note_text.is_empty() {
            println!("BACKEND - First character: {}", &note_text[0..1]);
            println!("BACKEND - Last character: {}", &note_text[note_text.len()-1..]);
        }
        // Generate timestamp in format [DD MMM YY, HH:MM:SS]
        let now = Local::now();
        let timestamp = format!(
            "[{:02} {} {:02}, {:02}:{:02}:{:02}]",
            now.day(),
            match now.month() {
                1 => "Jan", 2 => "Feb", 3 => "Mar", 4 => "Apr", 5 => "May", 6 => "Jun",
                7 => "Jul", 8 => "Aug", 9 => "Sep", 10 => "Oct", 11 => "Nov", 12 => "Dec",
                _ => "Unknown",
            },
            now.year() % 100,
            now.hour(),
            now.minute(),
            now.second()
        );
        
        // Structure the request body for appending a block to the page
        let append_body = json!({
            "children": [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": format!("{} {}", timestamp, note_text)
                                },
                                "annotations": {
                                    "bold": true,
                                    "color": "default"
                                }
                            }
                        ]
                    }
                }
            ]
        });
        
        let res = self.client
            .patch(&format!("https://api.notion.com/v1/blocks/{}/children", page_id))
            .json(&append_body)
            .send()
            .await
            .map_err(|e| crate::error::AppError::NetworkError {
                message: format!("API request failed: {}", e),
                is_offline: false // We'll assume online since we got an error from the request
            })?;
            
        // Handle rate limiting
        if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(self.handle_rate_limit(&res));
        }
        
        if !res.status().is_success() {
            // Store the status code before moving res
            let status = res.status();
            
            // Parse error details from the body
            let error_body: serde_json::Value = res.json()
                .await
                .map_err(|e| crate::error::AppError::NotionApiError {
                    message: format!("Failed to parse error response: {}", e),
                    status_code: Some(status.as_u16()),
                    error_code: None
                })?;
                
            // Get error code and message from the response
            let error_code = error_body["code"].as_str().map(|s| s.to_string());
            let error_message = error_body["message"].as_str().unwrap_or("Unknown error").to_string();
            
            return Err(crate::error::AppError::NotionApiError {
                message: format!("{}", error_message),
                status_code: Some(status.as_u16()),
                error_code
            });
        }
        
        // Process response headers to extract rate limit information
        self.process_response_headers(&res);
        
        Ok(())
    }
}

// Tauri commands for Notion API integration

// Function to invalidate cache (call when token changes)
fn invalidate_cache() {
    let mut cache = PAGES_CACHE.lock().unwrap();
    *cache = None;
}

// Set and verify API token
#[tauri::command]
pub async fn set_notion_api_token(
    api_token: String,
    state: State<'_, AppState>,
    window: tauri::Window
) -> Result<bool, crate::error::ErrorResponse> {
    // Validation
    if api_token.trim().is_empty() {
        return Err(crate::error::AppError::ValidationError(
            "API token cannot be empty".to_string()
        ).into());
    }
    
    // Clear all caches when token changes
    invalidate_cache();
    
    // Log the action
    println!("Attempting to verify and set Notion API token");
    
    match NotionApiClient::new(api_token.clone()) {
        Ok(client) => {
            match client.verify_token().await {
                Ok(valid) => {
                    if valid {
                        // Store token securely
                        let token_to_save = api_token.clone();
                        {
                            let mut config = state.config.lock().unwrap();
                            config.notion_api_token = token_to_save;
                            // Save to disk
                            if let Err(e) = config.save() {
                                return Err(crate::error::AppError::ConfigError(
                                    format!("Failed to save config: {}", e)
                                ).into());
                            }
                        }
                        
                        // Emit the rate limit info to the frontend
                        let rate_limit_manager = RateLimitManager::instance();
                        rate_limit_manager.emit_rate_limit_event(&window, &api_token);
                        
                        println!("Successfully verified and saved Notion API token");
                        Ok(true)
                    } else {
                        Err(crate::error::AppError::NotionApiError {
                            message: "Invalid API token".into(),
                            status_code: None,
                            error_code: None,
                        }.into())
                    }
                }
                Err(e) => {
                    // Log the error
                    crate::error::log_error(&e, "set_notion_api_token");
                    Err(e.into())
                }
            }
        }
        Err(e) => Err(crate::error::AppError::NotionApiError {
            message: format!("Failed to create API client: {}", e),
            status_code: None,
            error_code: None,
        }.into())
    }
}

// Get the stored API token
#[tauri::command]
pub fn get_notion_api_token(state: State<'_, AppState>) -> Result<String, crate::error::ErrorResponse> {
    let config = match state.config.lock() {
        Ok(config) => config,
        Err(e) => {
            return Err(crate::error::AppError::ConfigError(
                format!("Failed to access config: {}", e)
            ).into());
        }
    };
    
    Ok(config.notion_api_token.clone())
}

// Search Notion pages with cache usage
#[tauri::command]
pub async fn search_notion_pages(
    state: State<'_, AppState>,
    window: tauri::Window
) -> Result<Vec<NotionPage>, crate::error::ErrorResponse> {
    let api_token;
    {
        let config = match state.config.lock() {
            Ok(config) => config,
            Err(e) => {
                return Err(crate::error::AppError::ConfigError(
                    format!("Failed to access config: {}", e)
                ).into());
            }
        };
        
        api_token = config.notion_api_token.clone();
    }
    
    if api_token.is_empty() {
        return Err(crate::error::AppError::NotionApiError {
            message: "API token is not set".into(),
            status_code: None,
            error_code: None,
        }.into());
    }
    
    // Log the action
    println!("Searching Notion pages");
    
    match NotionApiClient::new(api_token.clone()) {
        Ok(client) => {
            let result = match client.search_pages().await {
                Ok(pages) => {
                    println!("Found {} Notion pages", pages.len());
                    Ok(pages)
                },
                Err(e) => {
                    // Log the error
                    crate::error::log_error(&e, "search_notion_pages");
                    Err(e.into())
                }
            };
            
            // Always emit rate limit info to the frontend
            let rate_limit_manager = RateLimitManager::instance();
            rate_limit_manager.emit_rate_limit_event(&window, &api_token);
            
            result
        },
        Err(e) => Err(crate::error::AppError::NotionApiError {
            message: format!("Failed to create API client: {}", e),
            status_code: None,
            error_code: None,
        }.into())
    }
}

// Get information about a specific page by ID
#[tauri::command]
pub async fn get_page_info(
    page_id: String,
    state: State<'_, AppState>,
    window: tauri::Window
) -> Result<NotionPage, crate::error::ErrorResponse> {
    // Validate input
    if page_id.trim().is_empty() {
        return Err(crate::error::AppError::ValidationError(
            "Page ID cannot be empty".to_string()
        ).into());
    }
    
    let api_token;
    {
        let config = match state.config.lock() {
            Ok(config) => config,
            Err(e) => {
                return Err(crate::error::AppError::ConfigError(
                    format!("Failed to access config: {}", e)
                ).into());
            }
        };
        
        api_token = config.notion_api_token.clone();
    }
    
    if api_token.is_empty() {
        return Err(crate::error::AppError::NotionApiError {
            message: "API token is not set".into(),
            status_code: None,
            error_code: None,
        }.into());
    }
    
    println!("Fetching info for Notion page: {}", page_id);
    
    match NotionApiClient::new(api_token.clone()) {
        Ok(client) => {
            // First check if we're currently rate limited
            if let Err(e) = client.check_rate_limit().await {
                // Always emit rate limit info to the frontend
                let rate_limit_manager = RateLimitManager::instance();
                rate_limit_manager.emit_rate_limit_event(&window, &api_token);
                return Err(e.into());
            }
            
            // Get all pages and find matching one (more efficient than making a new API call)
            match client.search_pages().await {
                Ok(pages) => {
                    // Find the page with matching ID
                    if let Some(page) = pages.iter().find(|p| p.id == page_id) {
                        // Always emit rate limit info to the frontend
                        let rate_limit_manager = RateLimitManager::instance();
                        rate_limit_manager.emit_rate_limit_event(&window, &api_token);
                        
                        Ok(page.clone())
                    } else {
                        // If not found, use a default title
                        Ok(NotionPage {
                            id: page_id,
                            title: "Notion Page".to_string(),
                            icon: None,
                            url: String::new(),
                        })
                    }
                },
                Err(e) => {
                    // Log the error
                    crate::error::log_error(&e, "get_page_info");
                    
                    // Always emit rate limit info to the frontend
                    let rate_limit_manager = RateLimitManager::instance();
                    rate_limit_manager.emit_rate_limit_event(&window, &api_token);
                    
                    // Return a default page with just the ID
                    Ok(NotionPage {
                        id: page_id,
                        title: "Notion Page".to_string(),
                        icon: None,
                        url: String::new(),
                    })
                }
            }
        },
        Err(e) => Err(crate::error::AppError::NotionApiError {
            message: format!("Failed to create API client: {}", e),
            status_code: None,
            error_code: None,
        }.into())
    }
}

// Get the selected page ID
#[tauri::command]
pub fn get_selected_page_id(state: State<'_, AppState>) -> Result<String, crate::error::ErrorResponse> {
    let config = match state.config.lock() {
        Ok(config) => config,
        Err(e) => {
            return Err(crate::error::AppError::ConfigError(
                format!("Failed to access config: {}", e)
            ).into());
        }
    };
    
    Ok(config.selected_page_id.clone())
}

// Set the selected page ID
#[tauri::command]
pub fn set_selected_page_id(
    page_id: String,
    page_title: String,
    state: State<'_, AppState>,
) -> Result<(), crate::error::ErrorResponse> {
    // Validation
    if page_id.trim().is_empty() {
        return Err(crate::error::AppError::ValidationError(
            "Page ID cannot be empty".to_string()
        ).into());
    }
    
    // Log the action
    println!("Setting selected Notion page: {} ({})", page_title, page_id);
    
    let mut config = match state.config.lock() {
        Ok(config) => config,
        Err(e) => {
            return Err(crate::error::AppError::ConfigError(
                format!("Failed to access config: {}", e)
            ).into());
        }
    };
    
    config.selected_page_id = page_id;
    config.selected_page_title = page_title;
    
    match config.save() {
        Ok(_) => {
            println!("Successfully saved selected page");
            Ok(())
        },
        Err(e) => Err(crate::error::AppError::ConfigError(e).into())
    }
}

// Append a note to the selected Notion page
#[tauri::command]
pub async fn append_note(
    note_text: String,
    state: State<'_, AppState>,
    window: tauri::Window
) -> Result<(), crate::error::ErrorResponse> {
    // Check if the note is empty
    if note_text.trim().is_empty() {
        return Err(crate::error::AppError::ValidationError(
            "Cannot send an empty note".to_string()
        ).into());
    }
    
    let api_token;
    let page_id;
    
    // Check for network connectivity
    let is_online = true; // In the future, we would properly implement this
    
    {
        let config = state.config.lock().unwrap();
        
        if config.notion_api_token.is_empty() {
            return Err(crate::error::AppError::NotionApiError {
                message: "Notion API token not set".into(),
                status_code: None,
                error_code: None,
            }.into());
        }
        
        if config.selected_page_id.is_empty() {
            return Err(crate::error::AppError::NotionApiError {
                message: "No Notion page selected".into(),
                status_code: None,
                error_code: None,
            }.into());
        }
        
        page_id = config.selected_page_id.clone();
        api_token = config.notion_api_token.clone();
    }
    
    // If we're offline, handle it gracefully
    if !is_online {
        return Err(crate::error::AppError::OfflineError(
            "Cannot send note while offline".to_string()
        ).into());
    }
    
    // Create Notion API client and append the note
    match NotionApiClient::new(api_token.clone()) {
        Ok(client) => {
            // Log the attempt
            println!("Attempting to append note to page {}", page_id);
            
            let result = match client.append_note_to_page(&page_id, &note_text).await {
                Ok(_) => {
                    println!("Successfully appended note to page {}", page_id);
                    Ok(())
                },
                Err(e) => {
                    // Log the error
                    crate::error::log_error(&e, "append_note");
                    Err(e.into())
                }
            };
            
            // Always emit rate limit info to the frontend
            let rate_limit_manager = RateLimitManager::instance();
            rate_limit_manager.emit_rate_limit_event(&window, &api_token);
            
            result
        }
        Err(e) => {
            Err(crate::error::AppError::NotionApiError {
                message: format!("Failed to create API client: {}", e),
                status_code: None,
                error_code: None,
            }.into())
        }
    }
}