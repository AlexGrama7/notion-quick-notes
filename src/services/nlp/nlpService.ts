/**
 * Natural Language Processing Service
 * 
 * This service handles the analysis of natural language input,
 * extracting structured data, and preparing it for Notion integration.
 */

// import { invoke } from '@tauri-apps/api/tauri';
import { 
  Entity, 
  EntityType, 
  ProcessingResult, 
  NotionDatabaseItem,
  NLPServiceConfig,
  DEFAULT_NLP_CONFIG
} from './types';
import { extractEntities } from './entityExtractor';
import { getSyncService } from '../syncService';

// Singleton instance for NLP service
let nlpServiceInstance: NLPService | null = null;

// Configuration
let currentConfig: NLPServiceConfig = { ...DEFAULT_NLP_CONFIG };

/**
 * NLP Service class for handling natural language processing
 */
export class NLPService {
  private config: NLPServiceConfig;
  
  constructor(config: NLPServiceConfig = currentConfig) {
    this.config = { ...config };
    this.loadConfig(); // Load saved configuration if available
  }
  
  /**
   * Process natural language input and extract structured information
   */
  public async processInput(text: string): Promise<ProcessingResult> {
    console.log('NLPService.processInput called with text:', text);
    
    try {
      // Extract entities from the text
      console.log('Extracting entities with useAI:', this.config.useAI);
      const entities = await extractEntities(text, this.config.useAI);
      console.log('Extracted entities:', entities);
      
      // Convert entities to structured data
      console.log('Converting to structured data');
      const structuredData = this.convertToStructuredData(text, entities);
      console.log('Structured data:', structuredData);
      
      // Calculate overall confidence
      const confidence = this.calculateConfidence(entities);
      console.log('Calculated confidence:', confidence);
      
      // Determine if user confirmation is needed
      const needsUserConfirmation =
        this.config.requireConfirmation ||
        confidence < this.config.confidenceThreshold;
      console.log('Needs user confirmation:', needsUserConfirmation);
      
      const result = {
        entities,
        structuredData,
        confidence,
        needsUserConfirmation
      };
      
      console.log('Final processing result:', result);
      return result;
    } catch (error) {
      console.error('Error processing input:', error);
      throw error;
    }
  }
  
  /**
   * Convert extracted entities to structured Notion data
   */
  private convertToStructuredData(
    originalText: string, 
    entities: Entity[]
  ): NotionDatabaseItem {
    // Initialize with default values
    const structuredData: NotionDatabaseItem = {
      title: originalText,
      status: this.config.defaultStatus,
    };
    
    // Extract date/time information
    const dateEntities = entities.filter(e => e.type === EntityType.DATE);
    const timeEntities = entities.filter(e => e.type === EntityType.TIME);
    const dateTimeEntities = entities.filter(e => e.type === EntityType.DATETIME);
    
    // If we have datetime entities, use those first
    if (dateTimeEntities.length > 0) {
      const datetime = dateTimeEntities.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );
      
      if (datetime.metadata?.iso8601) {
        structuredData.reminderTime = datetime.metadata.iso8601;
      } else {
        // Format as best we can
        structuredData.date = datetime.value;
      }
    } else {
      // Otherwise, use separate date and time entities
      if (dateEntities.length > 0) {
        const bestDate = dateEntities.reduce((prev, current) => 
          current.confidence > prev.confidence ? current : prev
        );
        structuredData.date = bestDate.value;
      }
      
      if (timeEntities.length > 0) {
        const bestTime = timeEntities.reduce((prev, current) => 
          current.confidence > prev.confidence ? current : prev
        );
        structuredData.time = bestTime.value;
        
        // If we have both date and time, create a reminder time
        if (structuredData.date) {
          structuredData.reminderTime = `${structuredData.date} ${structuredData.time}`;
        }
      }
    }
    
    // Extract priority information
    const priorityEntities = entities.filter(e => e.type === EntityType.PRIORITY);
    if (priorityEntities.length > 0) {
      const bestPriority = priorityEntities.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );
      structuredData.priority = bestPriority.metadata?.level || 'medium';
    }
    
    // Extract action information to enhance the title
    const actionEntities = entities.filter(e => e.type === EntityType.ACTION);
    if (actionEntities.length > 0) {
      const bestAction = actionEntities.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );
      
      // If this is a reminder, format the title accordingly
      if (bestAction.metadata?.isReminder) {
        structuredData.title = bestAction.metadata.object || originalText;
      }
    }
    
    return structuredData;
  }
  
  /**
   * Calculate overall confidence based on extracted entities
   */
  private calculateConfidence(entities: Entity[]): number {
    if (entities.length === 0) return 0;
    
    // Calculate weighted confidence
    let totalConfidence = 0;
    let weights = 0;
    
    for (const entity of entities) {
      let weight = 1; // Default weight
      
      // Assign higher weights to important entities
      switch (entity.type) {
        case EntityType.DATE:
        case EntityType.TIME:
        case EntityType.DATETIME:
          weight = 2;
          break;
        case EntityType.ACTION:
          weight = 3;
          break;
        default:
          weight = 1;
      }
      
      totalConfidence += entity.confidence * weight;
      weights += weight;
    }
    
    return weights > 0 ? totalConfidence / weights : 0;
  }
  
  /**
   * Send processed data to Notion
   */
  public async sendToNotion(
    structuredData: NotionDatabaseItem,
    pageId: string
  ): Promise<boolean> {
    try {
      const syncService = getSyncService();
      
      // For now, we'll just send the title as a note
      // In a full implementation, this would use a different API to create
      // database items with proper fields
      const success = await syncService.addNote(
        structuredData.title,
        pageId
      );
      
      return !!success;
    } catch (error) {
      console.error('Error sending to Notion:', error);
      throw error;
    }
  }
  
  /**
   * Update the NLP service configuration
   */
  public updateConfig(newConfig: Partial<NLPServiceConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    // Update the global configuration
    currentConfig = { ...this.config };
    
    // Save to local storage
    this.saveConfig();
  }
  
  /**
   * Save configuration to local storage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem('nlp_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save NLP configuration:', error);
    }
  }
  
  /**
   * Load configuration from local storage
   */
  private loadConfig(): void {
    try {
      const savedConfig = localStorage.getItem('nlp_config');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig) as Partial<NLPServiceConfig>;
        this.config = {
          ...this.config,
          ...parsedConfig
        };
      }
    } catch (error) {
      console.error('Failed to load NLP configuration:', error);
    }
  }
}

/**
 * Get the NLP service instance (singleton)
 */
export function getNLPService(): NLPService {
  if (!nlpServiceInstance) {
    nlpServiceInstance = new NLPService();
  }
  return nlpServiceInstance;
}

/**
 * Initialize the NLP service
 */
export function initializeNLPService(config?: NLPServiceConfig): NLPService {
  if (config) {
    currentConfig = { ...DEFAULT_NLP_CONFIG, ...config };
  }
  
  nlpServiceInstance = new NLPService(currentConfig);
  return nlpServiceInstance;
}

/**
 * Update NLP service configuration
 */
export function updateNLPConfig(newConfig: Partial<NLPServiceConfig>): void {
  const service = getNLPService();
  service.updateConfig(newConfig);
}

/**
 * Process text with NLP and return the structured result
 */
export async function processNaturalLanguage(
  text: string
): Promise<ProcessingResult> {
  const service = getNLPService();
  return service.processInput(text);
}