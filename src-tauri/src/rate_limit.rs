use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use rand::{thread_rng, Rng};
// Removed unused import: use serde::Serialize;
use tauri::Window;

/// Represents the rate limit state for a specific API token
#[derive(Debug, Clone)]
pub struct RateLimitState {
    /// Number of remaining requests in the current time window
    pub remaining: Option<u32>,
    
    /// When the rate limit will reset (if known)
    pub reset_at: Option<Instant>,
    
    /// Total limit in the time window (if known)
    pub limit: Option<u32>,
    
    /// When this state was last updated
    pub last_updated: Instant,
    
    /// History of recent requests to use for backoff calculation
    pub recent_requests: Vec<Instant>,
    
    /// Number of consecutive rate limit errors
    pub consecutive_rate_limits: u32,
    
    /// Whether we're currently in rate limited state
    pub is_rate_limited: bool,
}

impl Default for RateLimitState {
    fn default() -> Self {
        Self {
            remaining: None,
            reset_at: None,
            limit: None,
            last_updated: Instant::now(),
            recent_requests: Vec::new(),
            consecutive_rate_limits: 0,
            is_rate_limited: false,
        }
    }
}

impl RateLimitState {
    /// Calculate if we should allow a new request based on rate limit state
    pub fn should_allow_request(&self) -> bool {
        // If we're not currently rate limited, allow the request
        if !self.is_rate_limited {
            return true;
        }
        
        // If we know when the rate limit resets and it's in the past, allow the request
        if let Some(reset_time) = self.reset_at {
            if Instant::now() > reset_time {
                return true;
            }
        }
        
        // If we have known remaining requests, allow if greater than zero
        if let Some(remaining) = self.remaining {
            return remaining > 0;
        }
        
        // Otherwise, use backoff calculation to determine if we should allow
        self.backoff_allows_request()
    }
    
    /// Use exponential backoff to determine if a request should be allowed
    fn backoff_allows_request(&self) -> bool {
        // If we have no consecutive rate limits, allow the request
        if self.consecutive_rate_limits == 0 {
            return true;
        }
        
        // Calculate backoff time based on consecutive failures with jitter
        let base_backoff_ms = 1000u64;  // Start with 1 second
        let max_backoff_ms = 300000u64; // Max 5 minutes
        
        let exponent = self.consecutive_rate_limits.min(10) as u32; // Cap at 10 to avoid overflow
        let backoff_ms = base_backoff_ms * (1u64 << exponent);
        let backoff_ms = backoff_ms.min(max_backoff_ms);
        
        // Add jitter to prevent thundering herd problem (±25%)
        let jitter_factor = thread_rng().gen_range(0.75..1.25);
        let jittered_backoff_ms = (backoff_ms as f64 * jitter_factor) as u64;
        
        // Check if enough time has elapsed since the last rate limit
        let backoff_duration = Duration::from_millis(jittered_backoff_ms);
        let time_since_last_update = Instant::now().duration_since(self.last_updated);
        
        time_since_last_update >= backoff_duration
    }
    
    /// Record a successful request
    pub fn record_success(&mut self) {
        self.consecutive_rate_limits = 0;
        self.is_rate_limited = false;
        self.recent_requests.push(Instant::now());
        
        // Only keep the most recent requests for calculations
        if self.recent_requests.len() > 20 {
            self.recent_requests.remove(0);
        }
    }
    
    /// Record a rate limit error and update state
    pub fn record_rate_limit(&mut self, reset_seconds: Option<u64>, remaining: Option<u32>, limit: Option<u32>) {
        self.consecutive_rate_limits += 1;
        self.is_rate_limited = true;
        self.last_updated = Instant::now();
        
        // Update state from response headers if available
        self.remaining = remaining;
        self.limit = limit;
        
        // Calculate reset time if provided
        if let Some(seconds) = reset_seconds {
            self.reset_at = Some(Instant::now() + Duration::from_secs(seconds));
        }
    }
    
    /// Get time until rate limit reset in seconds
    pub fn time_until_reset(&self) -> Option<u64> {
        self.reset_at.map(|reset| {
            let now = Instant::now();
            if now >= reset {
                0
            } else {
                reset.duration_since(now).as_secs()
            }
        })
    }
    
    /// Calculate and return the delay recommendation before the next request
    pub fn get_recommended_delay(&self) -> Duration {
        if !self.is_rate_limited {
            return Duration::from_millis(0);
        }
        
        // If we know when the rate limit resets, use that
        if let Some(reset_time) = self.reset_at {
            let now = Instant::now();
            if reset_time > now {
                return reset_time.duration_since(now);
            }
        }
        
        // Otherwise, use exponential backoff calculation
        let base_backoff_ms = 1000u64;  // Start with 1 second
        let max_backoff_ms = 300000u64; // Max 5 minutes
        
        let exponent = self.consecutive_rate_limits.min(10) as u32;
        let backoff_ms = base_backoff_ms * (1u64 << exponent);
        let backoff_ms = backoff_ms.min(max_backoff_ms);
        
        // Add jitter to prevent thundering herd problem (±25%)
        let jitter_factor = thread_rng().gen_range(0.75..1.25);
        let jittered_backoff_ms = (backoff_ms as f64 * jitter_factor) as u64;
        
        Duration::from_millis(jittered_backoff_ms)
    }
}

/// Manages rate limits for multiple API tokens
pub struct RateLimitManager {
    /// Map of API token to rate limit state
    states: Arc<Mutex<HashMap<String, RateLimitState>>>,
}

// Static singleton instance
lazy_static::lazy_static! {
    static ref RATE_LIMIT_MANAGER: RateLimitManager = RateLimitManager::new();
}

impl RateLimitManager {
    /// Create a new rate limit manager
    pub fn new() -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    /// Get the singleton instance
    pub fn instance() -> &'static RateLimitManager {
        &RATE_LIMIT_MANAGER
    }
    
    /// Emit a rate limit changed event to the frontend
    pub fn emit_rate_limit_event(&self, window: &Window, token: &str) {
        // Get the current rate limit state
        let state = self.get_state(token);
        let is_limited = !self.should_allow_request(token);
        
        // Calculate the current Unix timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        // Calculate reset time as a Unix timestamp
        let reset_at = state.as_ref().and_then(|s| {
            s.time_until_reset().map(|secs| now + secs)
        });
        
        // Get the recommended delay if we're limited
        let retry_after = if is_limited {
            let delay = self.get_recommended_delay(token);
            if !delay.is_zero() {
                Some(delay.as_secs())
            } else {
                None
            }
        } else {
            None
        };
        
        // Create the payload with rate limit information
        let payload = serde_json::json!({
            "limit": state.as_ref().and_then(|s| s.limit),
            "remaining": state.as_ref().and_then(|s| s.remaining),
            "reset_at": reset_at,
            "is_limited": is_limited,
            "retry_after": retry_after,
        });
        
        // Emit the event to the frontend
        let _ = window.emit("rate-limit-changed", payload);
    }
    
    /// Check if a request should be allowed for the given token
    pub fn should_allow_request(&self, token: &str) -> bool {
        let states = self.states.lock().unwrap();
        
        match states.get(token) {
            Some(state) => state.should_allow_request(),
            None => true, // No state means no rate limiting yet
        }
    }
    
    /// Get the recommended delay before the next request
    pub fn get_recommended_delay(&self, token: &str) -> Duration {
        let states = self.states.lock().unwrap();
        
        match states.get(token) {
            Some(state) => state.get_recommended_delay(),
            None => Duration::from_millis(0),
        }
    }
    
    /// Record a successful request
    pub fn record_success(&self, token: &str) {
        let mut states = self.states.lock().unwrap();
        
        let state = states.entry(token.to_string()).or_default();
        state.record_success();
    }
    
    /// Record a rate limit error from response headers
    pub fn record_rate_limit(&self, token: &str, reset_seconds: Option<u64>, remaining: Option<u32>, limit: Option<u32>) {
        let mut states = self.states.lock().unwrap();
        
        let state = states.entry(token.to_string()).or_default();
        state.record_rate_limit(reset_seconds, remaining, limit);
    }
    
    /// Get rate limit state for a token
    pub fn get_state(&self, token: &str) -> Option<RateLimitState> {
        let states = self.states.lock().unwrap();
        states.get(token).cloned()
    }
    
    /// Calculate time until rate limit resets for a token
    pub fn time_until_reset(&self, token: &str) -> Option<u64> {
        let states = self.states.lock().unwrap();
        states.get(token)?.time_until_reset()
    }
}

/// Extract rate limit information from response headers
pub fn extract_rate_limit_headers(headers: &reqwest::header::HeaderMap) -> (Option<u64>, Option<u32>, Option<u32>) {
    // Default Notion API headers:
    // x-ratelimit-limit: The total number of requests allowed within the time window
    // x-ratelimit-remaining: The number of remaining requests in the time window
    // x-ratelimit-reset: The timestamp when the rate limit window resets (epoch seconds)
    
    let limit = headers.get("x-ratelimit-limit")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok());
        
    let remaining = headers.get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok());
        
    let reset = headers.get("x-ratelimit-reset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .map(|unix_timestamp| {
            // Convert unix timestamp to seconds from now
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            
            if unix_timestamp > now {
                unix_timestamp - now
            } else {
                0 // Already expired
            }
        });
        
    (reset, remaining, limit)
}

/// Create a user-friendly message about rate limiting
pub fn get_rate_limit_message(state: &RateLimitState) -> String {
    let base_message = "You've reached Notion's API rate limit.";
    
    if let Some(seconds) = state.time_until_reset() {
        if seconds < 60 {
            format!("{} Please try again in {} seconds.", base_message, seconds)
        } else if seconds < 3600 {
            let minutes = (seconds + 59) / 60; // Round up
            format!("{} Please try again in {} minute{}.", 
                   base_message, 
                   minutes, 
                   if minutes == 1 { "" } else { "s" })
        } else {
            let hours = (seconds + 3599) / 3600; // Round up
            format!("{} Please try again in {} hour{}.", 
                   base_message, 
                   hours, 
                   if hours == 1 { "" } else { "s" })
        }
    } else {
        let delay = state.get_recommended_delay();
        let seconds = delay.as_secs();
        
        if seconds < 60 {
            format!("{} Please wait a few seconds before trying again.", base_message)
        } else if seconds < 300 {
            format!("{} Please wait a few minutes before trying again.", base_message)
        } else {
            format!("{} Please try again later.", base_message)
        }
    }
}