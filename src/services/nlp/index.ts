/**
 * Natural Language Processing (NLP) Service Index
 *
 * This module exports all the NLP service functionality for use in the application.
 */

// Import and re-export
import {
  NLPService,
  getNLPService,
  initializeNLPService,
  updateNLPConfig,
  processNaturalLanguage
} from './nlpService';

import {
  Entity,
  EntityType,
  DateTimeEntity,
  ActionEntity,
  PriorityEntity,
  ConfidenceLevel,
  ProcessingResult,
  NotionDatabaseItem,
  NLPServiceConfig,
  DEFAULT_NLP_CONFIG
} from './types';

import {
  extractEntities,
  extractEntitiesRuleBased,
  extractEntitiesWithAI
} from './entityExtractor';

// Export types using 'export type' for isolatedModules
export type {
  Entity,
  EntityType,
  DateTimeEntity,
  ActionEntity,
  PriorityEntity,
  ConfidenceLevel,
  ProcessingResult,
  NotionDatabaseItem,
  NLPServiceConfig
};

// Export values
export {
  DEFAULT_NLP_CONFIG,
  NLPService,
  getNLPService,
  initializeNLPService,
  updateNLPConfig,
  processNaturalLanguage,
  extractEntities,
  extractEntitiesRuleBased,
  extractEntitiesWithAI
};