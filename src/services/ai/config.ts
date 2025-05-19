/**
 * Configuration for AI services
 */
import { AIServiceSettings, ModelType } from './types';

// Default settings for the AI service
export const DEFAULT_AI_SETTINGS: AIServiceSettings = {
  primaryModel: {
    apiKey: '', // Must be set by user
    modelName: ModelType.GPT4o,
    temperature: 0.7,
    maxTokens: 1000,
    timeout: 30000, // 30 seconds
    retryCount: 2,
  },
  fallbackModel: {
    apiKey: '', // Will use the same key as primary by default
    modelName: ModelType.GPT4oMini,
    temperature: 0.7,
    maxTokens: 1000,
    timeout: 15000, // 15 seconds
    retryCount: 3, // More retries for the fallback model
  },
  fallbackStrategy: {
    maxLatency: 10000, // 10 seconds before considering fallback
    maxRetries: 2, // Fall back after this many retries
    errorCodes: [
      'rate_limit_exceeded',
      'server_error',
      'model_overloaded',
      'context_length_exceeded',
      'requests_per_min',
    ],
    enabled: true,
    preserveContext: true,
    notifyUser: true,
  },
  enableTelemetry: false,
  logLevel: 'info',
};

// Load settings from localStorage or use defaults
export function loadAISettings(): AIServiceSettings {
  try {
    const savedSettings = localStorage.getItem('ai_settings');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings) as Partial<AIServiceSettings>;
      
      // Merge with defaults (to handle cases where saved settings might not have all properties)
      return {
        ...DEFAULT_AI_SETTINGS,
        ...parsedSettings,
        // Ensure nested objects are merged correctly
        primaryModel: {
          ...DEFAULT_AI_SETTINGS.primaryModel,
          ...(parsedSettings.primaryModel || {}),
        },
        fallbackModel: {
          ...DEFAULT_AI_SETTINGS.fallbackModel,
          ...(parsedSettings.fallbackModel || {}),
        },
        fallbackStrategy: {
          ...DEFAULT_AI_SETTINGS.fallbackStrategy,
          ...(parsedSettings.fallbackStrategy || {}),
        },
      };
    }
  } catch (error) {
    console.error('Failed to load AI settings:', error);
    // If there's an error loading settings, use defaults
  }
  
  return DEFAULT_AI_SETTINGS;
}

// Save settings to localStorage
export function saveAISettings(settings: AIServiceSettings): void {
  try {
    localStorage.setItem('ai_settings', JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save AI settings:', error);
  }
}