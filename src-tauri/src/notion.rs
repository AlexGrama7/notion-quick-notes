use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use chrono::{Local, Timelike, Datelike};
use std::sync::{Mutex, Arc};
use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::config::AppState;

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
    pub fn new(api_token: String) -> Result<Self, String> {
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
                .map_err(|e| format!("Invalid API token: {}", e))?
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
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
        
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
    
    pub async fn verify_token(&self) -> Result<bool, String> {
        let res = self.client
            .get("https://api.notion.com/v1/users/me")
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;
            
        Ok(res.status().is_success())
    }
    
    pub async fn search_pages(&self) -> Result<Vec<NotionPage>, String> {
        // Check cache first
        {
            let cache = PAGES_CACHE.lock().unwrap();
            if let Some(entry) = &*cache {
                if Instant::now() < entry.expires_at {
                    return Ok(entry.data.clone());
                }
            }
        }
        
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
            .map_err(|e| format!("API request failed: {}", e))?;
            
        if !res.status().is_success() {
            return Err(format!("API error: {}", res.status()));
        }
        
        let search_result: serde_json::Value = res.json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
            
        let pages: Vec<NotionPage> = search_result["results"]
            .as_array()
            .ok_or("Invalid response format")?
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
    ) -> Result<(), String> {
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
            .map_err(|e| format!("API request failed: {}", e))?;
            
        if !res.status().is_success() {
            // Store the status code before moving res
            let status = res.status();
            let error_body: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse error response: {}", e))?;
                
            return Err(format!(
                "API error: {} - {}", 
                status,
                error_body["message"].as_str().unwrap_or("Unknown error")
            ));
        }
        
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
) -> Result<bool, String> {
    // Clear all caches when token changes
    invalidate_cache();
    
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
                                return Err(format!("Failed to save config: {}", e));
                            }
                        }
                        Ok(true)
                    } else {
                        Err("Invalid API token".into())
                    }
                }
                Err(e) => Err(format!("Failed to verify token: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to create API client: {}", e))
    }
}

// Get the stored API token
#[tauri::command]
pub fn get_notion_api_token(state: State<'_, AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    Ok(config.notion_api_token.clone())
}

// Search Notion pages with cache usage
#[tauri::command]
pub async fn search_notion_pages(
    state: State<'_, AppState>,
) -> Result<Vec<NotionPage>, String> {
    // Extract what we need from the Mutex and immediately drop the lock
    let api_token = {
        let config = state.config.lock().unwrap();
        let token = config.notion_api_token.clone();
        if token.is_empty() {
            return Err("API token is not set".into());
        }
        token
    }; // MutexGuard is dropped here
    
    // Now we can safely use .await
    let client = NotionApiClient::new(api_token)?;
    client.search_pages().await
}

// Get the selected page ID
#[tauri::command]
pub fn get_selected_page_id(state: State<'_, AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    Ok(config.selected_page_id.clone())
}

// Set the selected page ID
#[tauri::command]
pub fn set_selected_page_id(
    page_id: String,
    page_title: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();
    config.selected_page_id = page_id;
    config.selected_page_title = page_title;
    config.save()
}

// Append a note to the selected Notion page
#[tauri::command]
pub async fn append_note(
    note_text: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Extract what we need and drop the lock before async operations
    let (api_token, page_id) = {
        let config = state.config.lock().unwrap();
        
        if config.notion_api_token.is_empty() {
            return Err("Notion API token not set".into());
        }
        
        if config.selected_page_id.is_empty() {
            return Err("No Notion page selected".into());
        }
        
        (config.notion_api_token.clone(), config.selected_page_id.clone())
    }; // MutexGuard is dropped here
    
    // Now we can safely use .await
    let client = NotionApiClient::new(api_token)?;
    client.append_note_to_page(&page_id, &note_text).await
}