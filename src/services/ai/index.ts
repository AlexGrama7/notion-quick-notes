/**
 * AI Service exports
 */

// Re-export types
export * from './types';

// Re-export service functions
export {
  sendPrompt,
  getAIState,
  updateAISettings,
  addAIEventListener,
  initializeAIService,
  AI_EVENTS,
} from './aiService';

// Re-export config functions
export {
  loadAISettings,
  saveAISettings,
  DEFAULT_AI_SETTINGS,
} from './config';