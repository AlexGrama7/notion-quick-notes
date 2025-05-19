/**
 * Type definitions for the NLP service
 */

// Recognized entity types
export enum EntityType {
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  DURATION = 'duration',
  ACTION = 'action',
  PRIORITY = 'priority',
  PERSON = 'person',
  LOCATION = 'location',
  TOPIC = 'topic',
}

// Structure of an extracted entity
export interface Entity {
  type: EntityType;
  value: string;
  originalText: string;
  confidence: number;
  metadata?: Record<string, any>;
}

// Structured data for a date/time entity
export interface DateTimeEntity extends Entity {
  type: EntityType.DATE | EntityType.TIME | EntityType.DATETIME;
  metadata: {
    iso8601?: string;   // ISO formatted date/time
    timestamp?: number; // Unix timestamp
    isRelative?: boolean; // Whether this is a relative time (tomorrow, next week)
    specificTime?: boolean; // Whether a specific time was mentioned
  };
}

// Structured data for an action entity
export interface ActionEntity extends Entity {
  type: EntityType.ACTION;
  metadata: {
    verb: string;
    object?: string;
    isReminder?: boolean;
  };
}

// Structure for a priority entity
export interface PriorityEntity extends Entity {
  type: EntityType.PRIORITY;
  metadata: {
    level: 'low' | 'medium' | 'high' | 'urgent';
    numeric?: number; // 1-5 scale
  };
}

// Confidence levels for entity extraction
export enum ConfidenceLevel {
  LOW = 0.3,
  MEDIUM = 0.6,
  HIGH = 0.8,
  VERY_HIGH = 0.95,
}

// Result of NLP processing
export interface ProcessingResult {
  entities: Entity[];
  structuredData?: NotionDatabaseItem;
  confidence: number;
  needsUserConfirmation: boolean;
}

// Mapped data for Notion database
export interface NotionDatabaseItem {
  title: string;
  date?: string;
  time?: string;
  reminderTime?: string;
  priority?: string;
  status?: string;
  tags?: string[];
  notes?: string;
}

// Configuration for the NLP service
export interface NLPServiceConfig {
  useAI: boolean;
  confidenceThreshold: number;
  requireConfirmation: boolean;
  defaultStatus: string;
}

// Default configuration
export const DEFAULT_NLP_CONFIG: NLPServiceConfig = {
  useAI: true,
  confidenceThreshold: ConfidenceLevel.MEDIUM,
  requireConfirmation: true,
  defaultStatus: 'To Do',
};