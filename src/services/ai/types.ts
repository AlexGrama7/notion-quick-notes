/**
 * Types for the AI service integration
 */

export enum ModelType {
  GPT4o = 'gpt-4o',
  GPT4oMini = 'gpt-4o-mini',
}

export interface ModelConfig {
  apiKey: string;
  modelName: ModelType;
  temperature?: number;
  maxTokens?: number;
  timeout?: number; // in milliseconds
  retryCount?: number;
}

export interface ModelResponse {
  content: string;
  modelUsed: ModelType;
  processingTime: number; // in milliseconds
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface ModelError {
  code: string;
  message: string;
  details?: string;
  retryable: boolean;
  modelUsed: ModelType;
}

export interface FallbackStrategy {
  // When to trigger a fallback
  maxLatency?: number; // in milliseconds
  maxRetries?: number; 
  errorCodes?: string[]; // Specific error codes that trigger fallback
  
  // How to handle fallback
  enabled: boolean;
  preserveContext: boolean; // Whether to carry context to the fallback model
  notifyUser: boolean; // Whether to notify users about the fallback
}

export interface AIServiceSettings {
  primaryModel: ModelConfig;
  fallbackModel: ModelConfig;
  fallbackStrategy: FallbackStrategy;
  enableTelemetry: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}