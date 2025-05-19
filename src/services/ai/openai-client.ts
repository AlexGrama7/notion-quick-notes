/**
 * OpenAI API client with support for GPT-4o and GPT-4o mini models
 * with automatic fallback capability
 */
import { ModelConfig, ModelResponse, ModelError, FallbackStrategy } from './types';
import { getNetworkStatus } from '../networkStatus';

/**
 * Error codes that map OpenAI API errors to our internal error representation
 */
const ERROR_CODES = {
  RATE_LIMIT: 'rate_limit_exceeded',
  INVALID_API_KEY: 'invalid_api_key',
  MODEL_OVERLOADED: 'model_overloaded',
  TIMEOUT: 'request_timeout',
  CONTEXT_LENGTH: 'context_length_exceeded',
  NETWORK_ERROR: 'network_error',
  UNKNOWN_ERROR: 'unknown_error',
  INVALID_REQUEST: 'invalid_request',
};

/**
 * Maps HTTP errors to application error codes
 */
function mapErrorToCode(error: any): string {
  if (!error?.response) {
    return getNetworkStatus().isNetworkOnline() 
      ? ERROR_CODES.UNKNOWN_ERROR 
      : ERROR_CODES.NETWORK_ERROR;
  }

  const status = error.response.status;
  const message = error.response.data?.error?.message || '';
  
  // Map HTTP status codes to error codes
  switch (status) {
    case 401:
      return ERROR_CODES.INVALID_API_KEY;
    case 429:
      return message.includes('quota') 
        ? ERROR_CODES.RATE_LIMIT 
        : ERROR_CODES.MODEL_OVERLOADED;
    case 413:
      return ERROR_CODES.CONTEXT_LENGTH;
    case 400:
      return ERROR_CODES.INVALID_REQUEST;
    case 408:
      return ERROR_CODES.TIMEOUT;
    case 500:
    case 502:
    case 503:
    case 504:
      return ERROR_CODES.MODEL_OVERLOADED;
    default:
      return ERROR_CODES.UNKNOWN_ERROR;
  }
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(code: string): boolean {
  const retryableCodes = [
    ERROR_CODES.RATE_LIMIT,
    ERROR_CODES.MODEL_OVERLOADED,
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.NETWORK_ERROR,
  ];
  
  return retryableCodes.includes(code);
}

/**
 * Creates headers for OpenAI API requests
 */
function createHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Makes an API call to OpenAI
 */
async function callOpenAI(
  prompt: string,
  config: ModelConfig,
  abortSignal?: AbortSignal
): Promise<ModelResponse> {
  const startTime = Date.now();
  
  try {
    // Construct request body
    const body = {
      model: config.modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 1000,
    };
    
    // Set up timeout if specified
    const timeout = config.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Use the provided abort signal if available, otherwise use our own
    const signal = abortSignal || controller.signal;
    
    // Make the API call
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: createHeaders(config.apiKey),
      body: JSON.stringify(body),
      signal,
    });
    
    // Clear timeout
    clearTimeout(timeoutId);
    
    // Check for errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        response: {
          status: response.status,
          data: errorData,
        },
      };
    }
    
    // Parse response
    const data = await response.json();
    const processingTime = Date.now() - startTime;
    
    // Extract token usage
    const tokenUsage = data.usage ? {
      input: data.usage.prompt_tokens,
      output: data.usage.completion_tokens,
      total: data.usage.total_tokens,
    } : undefined;
    
    // Return formatted response
    return {
      content: data.choices[0].message.content,
      modelUsed: config.modelName,
      processingTime,
      tokenUsage,
    };
  } catch (error: any) {
    // Handle abort errors
    if (error.name === 'AbortError') {
      throw {
        code: ERROR_CODES.TIMEOUT,
        message: 'Request timed out',
        retryable: true,
        modelUsed: config.modelName,
      };
    }
    
    // Map other errors to our format
    const errorCode = mapErrorToCode(error);
    throw {
      code: errorCode,
      message: error.response?.data?.error?.message || 'Unknown error occurred',
      details: JSON.stringify(error.response?.data || error.message || error),
      retryable: isRetryableError(errorCode),
      modelUsed: config.modelName,
    };
  }
}

/**
 * Decides whether to fall back to secondary model based on error and strategy
 */
function shouldFallback(
  error: ModelError,
  strategy: FallbackStrategy,
  attemptsMade: number
): boolean {
  if (!strategy.enabled) {
    return false;
  }
  
  // Check specific error codes that trigger fallback
  if (strategy.errorCodes && strategy.errorCodes.includes(error.code)) {
    return true;
  }
  
  // Check retry attempts
  if (strategy.maxRetries !== undefined && attemptsMade >= strategy.maxRetries) {
    return true;
  }
  
  return false;
}

/**
 * Makes API call with retry and fallback logic
 */
export async function queryAI(
  prompt: string,
  primaryConfig: ModelConfig,
  fallbackConfig: ModelConfig,
  fallbackStrategy: FallbackStrategy,
  abortSignal?: AbortSignal
): Promise<ModelResponse> {
  let attemptsMade = 0;
  const maxRetries = primaryConfig.retryCount || 2;
  
  // Try primary model first
  while (attemptsMade <= maxRetries) {
    try {
      const result = await callOpenAI(prompt, primaryConfig, abortSignal);
      return result;
    } catch (error: any) {
      attemptsMade++;
      
      // Check if we should retry primary model
      if (error.retryable && attemptsMade <= maxRetries) {
        // Exponential backoff for retries
        const backoffTime = Math.min(1000 * Math.pow(2, attemptsMade), 8000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        continue;
      }
      
      // Check if we should fall back to secondary model
      if (shouldFallback(error, fallbackStrategy, attemptsMade)) {
        break;
      }
      
      // If not retryable and not falling back, propagate the error
      throw error;
    }
  }
  
  // If primary model failed, try fallback model
  attemptsMade = 0;
  const fallbackMaxRetries = fallbackConfig.retryCount || 3;
  
  while (attemptsMade <= fallbackMaxRetries) {
    try {
      const result = await callOpenAI(prompt, fallbackConfig, abortSignal);
      return result;
    } catch (error: any) {
      attemptsMade++;
      
      // Check if we should retry fallback model
      if (error.retryable && attemptsMade <= fallbackMaxRetries) {
        // Exponential backoff for retries
        const backoffTime = Math.min(1000 * Math.pow(1.5, attemptsMade), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        continue;
      }
      
      // If not retryable or we've exhausted retries, propagate the error
      throw error;
    }
  }
  
  // This code should not be reached, but TypeScript requires a return statement
  throw new Error('Unexpected error: All retry and fallback attempts failed');
}