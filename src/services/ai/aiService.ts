/**
 * Primary service for AI operations with GPT-4o and automatic fallback to GPT-4o mini
 */
import { ModelResponse, ModelError, AIServiceSettings, ModelType } from './types';
import { loadAISettings, saveAISettings } from './config';
import { queryAI } from './openai-client';
import { invoke } from '@tauri-apps/api/tauri';

// Event names
export const AI_EVENTS = {
  MODEL_SWITCH: 'ai:model-switch',
  REQUEST_START: 'ai:request-start',
  REQUEST_END: 'ai:request-end',
  ERROR: 'ai:error',
  CONFIG_CHANGE: 'ai:config-change',
};

// Initialize the event system
const eventTarget = new EventTarget();

// Track the current AI state
let currentState = {
  activeModel: ModelType.GPT4o,
  lastRequestTime: 0,
  totalRequests: 0,
  failedRequests: 0,
  lastError: null as ModelError | null,
  settings: loadAISettings(),
  isProcessing: false,
};

/**
 * Send an AI event
 */
function sendEvent(eventName: string, detail?: any) {
  const event = new CustomEvent(eventName, { detail });
  eventTarget.dispatchEvent(event);
}

/**
 * Log AI-related information
 */
function logAI(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
  const logLevels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  
  // Only log if the level is at or above the configured level
  const configuredLevelValue = logLevels[currentState.settings.logLevel];
  const messageLevel = logLevels[level];
  
  if (messageLevel >= configuredLevelValue) {
    const logMethod = level === 'error' ? console.error :
                     level === 'warn' ? console.warn :
                     level === 'info' ? console.info :
                     console.debug;
    
    logMethod(`[AI Service] ${message}`, data);
    
    // Log to Tauri if available
    try {
      invoke('plugin:log|log', {
        level,
        message: `[AI] ${message}`,
        data: data ? JSON.stringify(data) : undefined,
      }).catch(() => {}); // Ignore errors from invoke
    } catch (e) {
      // Ignore errors if Tauri is not available
    }
  }
}

/**
 * Send telemetry data if enabled
 */
async function sendTelemetry(eventName: string, data: any) {
  if (!currentState.settings.enableTelemetry) {
    return;
  }
  
  try {
    await invoke('send_telemetry', {
      event: eventName,
      data: JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        activeModel: currentState.activeModel,
      }),
    });
  } catch (error) {
    logAI('debug', 'Failed to send telemetry', error);
  }
}

/**
 * Update current AI settings
 */
export function updateAISettings(settings: Partial<AIServiceSettings>): AIServiceSettings {
  const newSettings = {
    ...currentState.settings,
    ...settings,
    // Ensure nested objects are updated correctly
    primaryModel: {
      ...currentState.settings.primaryModel,
      ...(settings.primaryModel || {}),
    },
    fallbackModel: {
      ...currentState.settings.fallbackModel,
      ...(settings.fallbackModel || {}),
    },
    fallbackStrategy: {
      ...currentState.settings.fallbackStrategy,
      ...(settings.fallbackStrategy || {}),
    },
  };
  
  currentState.settings = newSettings;
  saveAISettings(newSettings);
  sendEvent(AI_EVENTS.CONFIG_CHANGE, { settings: newSettings });
  logAI('info', 'AI settings updated', newSettings);
  
  return newSettings;
}

/**
 * Get the current AI service state
 */
export function getAIState() {
  return {
    ...currentState,
    // Create a copy of settings to prevent modification
    settings: { ...currentState.settings },
  };
}

/**
 * Register an event listener
 */
export function addAIEventListener(
  eventName: string,
  callback: (event: CustomEvent) => void
): () => void {
  const listener = (event: Event) => callback(event as CustomEvent);
  eventTarget.addEventListener(eventName, listener);
  
  // Return a function to remove the listener
  return () => eventTarget.removeEventListener(eventName, listener);
}

/**
 * Send a prompt to the AI service
 */
export async function sendPrompt(prompt: string, abortSignal?: AbortSignal): Promise<ModelResponse> {
  if (!prompt.trim()) {
    throw new Error('Prompt cannot be empty');
  }
  
  // Update state
  currentState.isProcessing = true;
  currentState.lastRequestTime = Date.now();
  currentState.totalRequests++;
  
  // Notify listeners
  sendEvent(AI_EVENTS.REQUEST_START, { prompt });
  logAI('info', 'Starting AI request', { prompt: prompt.substring(0, 100) + '...' });
  
  try {
    // Get current settings
    const { primaryModel, fallbackModel, fallbackStrategy } = currentState.settings;
    
    // Ensure API key is set
    if (!primaryModel.apiKey) {
      throw {
        code: 'invalid_api_key',
        message: 'API key is not configured',
        retryable: false,
        modelUsed: primaryModel.modelName,
      };
    }
    
    // Set fallback model API key if not explicitly set
    if (!fallbackModel.apiKey && primaryModel.apiKey) {
      fallbackModel.apiKey = primaryModel.apiKey;
    }
    
    // Query the AI service
    const response = await queryAI(
      prompt,
      primaryModel,
      fallbackModel,
      fallbackStrategy,
      abortSignal
    );
    
    // Update state with model used
    if (response.modelUsed !== currentState.activeModel) {
      currentState.activeModel = response.modelUsed;
      sendEvent(AI_EVENTS.MODEL_SWITCH, { 
        from: currentState.activeModel,
        to: response.modelUsed,
        reason: 'fallback'
      });
      
      // Log model switch
      logAI('info', `Switched to model ${response.modelUsed}`, { 
        from: currentState.activeModel,
        to: response.modelUsed 
      });
    }
    
    // Send telemetry
    sendTelemetry('ai_request_success', {
      modelUsed: response.modelUsed,
      processingTime: response.processingTime,
      promptLength: prompt.length,
      responseLength: response.content.length,
      tokenUsage: response.tokenUsage,
    });
    
    // Notify listeners of completion
    sendEvent(AI_EVENTS.REQUEST_END, { response });
    logAI('info', 'AI request completed', { 
      modelUsed: response.modelUsed,
      time: response.processingTime 
    });
    
    return response;
  } catch (error: any) {
    // Update error state
    currentState.failedRequests++;
    currentState.lastError = error;
    
    // Notify listeners of error
    sendEvent(AI_EVENTS.ERROR, { error });
    logAI('error', 'AI request failed', error);
    
    // Send telemetry
    sendTelemetry('ai_request_error', {
      error: error.code || 'unknown_error',
      modelUsed: error.modelUsed,
      message: error.message,
    });
    
    throw error;
  } finally {
    currentState.isProcessing = false;
  }
}

/**
 * Initialize the AI service
 */
export function initializeAIService(): AIServiceSettings {
  const settings = loadAISettings();
  currentState.settings = settings;
  
  logAI('info', 'AI service initialized', { 
    primaryModel: settings.primaryModel.modelName,
    fallbackModel: settings.fallbackModel.modelName
  });
  
  return settings;
}