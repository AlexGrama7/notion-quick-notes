/**
 * Rate Limit Service
 * Manages communication with the backend for rate limit information and provides 
 * a centralized interface for rate limit data access.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

// Rate limit state interface
export interface RateLimitState {
  // Current rate limit information
  limit: number | null;        // Maximum requests allowed
  remaining: number | null;    // Remaining requests available
  resetAt: number | null;      // Unix timestamp when the limit resets
  
  // Rate limit status
  isLimited: boolean;          // Whether we're currently rate limited
  retryAfter: number | null;   // Seconds until retry is possible if rate limited
  
  // Usage percentage indicators
  usagePercent: number;        // Percentage of quota used (0-100)
  status: 'normal' | 'warning' | 'critical'; // Status indicator based on usage
}

// Initial default state
const defaultRateLimitState: RateLimitState = {
  limit: null,
  remaining: null,
  resetAt: null,
  isLimited: false,
  retryAfter: null,
  usagePercent: 0,
  status: 'normal'
};

// Event listeners for rate limit updates
let listenerInitialized = false;

/**
 * Hook for accessing rate limit data
 * @returns Current rate limit state and utility functions
 */
export function useRateLimit() {
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>(defaultRateLimitState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize rate limit listeners
  useEffect(() => {
    // Only initialize listeners once
    if (!listenerInitialized) {
      // Listen for rate limit update events from backend
      listen('rate-limit-changed', (event) => {
        updateRateLimitState(event.payload as any);
      });

      // Listen for rate limit violation events
      listen('rate-limit-exceeded', (event) => {
        const payload = event.payload as any;
        setRateLimitState(prev => ({
          ...prev,
          isLimited: true,
          retryAfter: payload.retryAfter || null,
          status: 'critical'
        }));
      });

      listenerInitialized = true;
    }

    // Fetch initial rate limit data
    fetchRateLimitData();
  }, []);

  // Calculate the status based on percentage
  const calculateStatus = (remaining: number | null, limit: number | null): 'normal' | 'warning' | 'critical' => {
    if (remaining === null || limit === null || limit === 0) return 'normal';
    
    const usagePercent = 100 - (remaining / limit * 100);
    
    if (usagePercent >= 90) return 'critical';
    if (usagePercent >= 75) return 'warning';
    return 'normal';
  };

  // Update rate limit state with new data
  const updateRateLimitState = (data: any) => {
    // Handle different field naming conventions from backend (snake_case vs camelCase)
    const remaining = data.remaining != null ? data.remaining : null;
    const limit = data.limit || null;
    const resetAt = data.reset_at || data.resetAt || null;
    const isLimited = !!data.is_limited || !!data.isLimited;
    const retryAfter = data.retry_after || data.retryAfter || null;
    
    const status = calculateStatus(remaining, limit);
    const usagePercent = limit && remaining != null
      ? 100 - (remaining / limit * 100)
      : 0;

    setRateLimitState({
      limit,
      remaining,
      resetAt,
      isLimited,
      retryAfter,
      usagePercent,
      status
    });

    console.log('Rate limit state updated:', { limit, remaining, resetAt, isLimited, retryAfter, usagePercent, status });
    setIsLoading(false);
    setError(null);
  };

  // Fetch rate limit data from the backend
  const fetchRateLimitData = async () => {
    try {
      setIsLoading(true);
      const data = await invoke('rate_limit_info');
      updateRateLimitState(data);
    } catch (err) {
      setError(`Failed to fetch rate limit data: ${err}`);
      setIsLoading(false);
    }
  };

  return {
    rateLimitState,
    isLoading,
    error,
    refresh: fetchRateLimitData
  };
}

/**
 * Calculate the time remaining until reset in a human-readable format
 * @param resetAt Unix timestamp when the limit resets
 * @returns Human readable time string (e.g., "2m 30s")
 */
export function getTimeUntilReset(resetAt: number | null): string {
  if (!resetAt) return 'Unknown';
  
  const now = Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, resetAt - now);
  
  if (seconds <= 0) return 'Now';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get a message based on the current rate limit state
 * @param state Current rate limit state
 * @returns User-friendly message about rate limits
 */
export function getRateLimitMessage(state: RateLimitState): string {
  if (state.isLimited) {
    return `Rate limit reached. Please try again in ${state.retryAfter || 'a few'} seconds.`;
  }
  
  if (state.status === 'warning') {
    return `API quota at ${Math.floor(state.usagePercent)}% usage. Approaching limit.`;
  }
  
  if (state.status === 'critical') {
    return `API quota at ${Math.floor(state.usagePercent)}% usage. Please slow down requests.`;
  }
  
  if (state.remaining !== null && state.limit) {
    return `API quota: ${state.remaining}/${state.limit} requests remaining.`;
  }
  
  return 'API quota status unavailable.';
}