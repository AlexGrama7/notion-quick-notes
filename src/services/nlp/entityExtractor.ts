/**
 * Entity extractor for natural language processing
 * 
 * This module handles the extraction of entities like dates, times, and actions
 * from natural language text using both rule-based approaches and AI assistance.
 */

import { 
  Entity,
  EntityType,
  DateTimeEntity,
  ActionEntity,
  PriorityEntity
} from './types';
import { sendPrompt } from '../ai';

// Common date/time formats
const DATE_PATTERNS = [
  // Today, tomorrow, yesterday
  /\b(today|tomorrow|yesterday)\b/i,
  
  // Days of the week
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  
  // Specific dates (MM/DD/YYYY, MM-DD-YYYY, etc.)
  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/,
  
  // Month + day formats (January 15, Jan 15, etc.)
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[\.]{0,1}\s+(\d{1,2})(st|nd|rd|th)?\b/i,
  
  // Relative dates (next week, in 2 days, etc.)
  /\b(next|this|last)\s+(week|month|year)\b/i,
  /\bin\s+(\d+)\s+(day|week|month|year)s?\b/i,
];

// Time patterns
const TIME_PATTERNS = [
  // HH:MM format (12hr and 24hr)
  /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i,
  
  // Natural language times - this pattern should match "6 pm"
  /\b(\d{1,2})\s*(am|pm)\b/i,
  
  // Additional time pattern specifically for X pm/am format with space
  /\b(\d{1,2})\s+(am|pm)\b/i,
  
  /\b(noon|midnight)\b/i,
  
  // Time-related phrases
  /\b(morning|afternoon|evening|night)\b/i,
];

// Priority indicators
const PRIORITY_PATTERNS = [
  // High priority indicators
  /\b(urgent|asap|immediately|high\s+priority|critical)\b/i,
  
  // Medium priority indicators
  /\b(medium\s+priority|important)\b/i,
  
  // Low priority indicators
  /\b(low\s+priority|whenever|not\s+urgent)\b/i,
  
  // Numeric priorities
  /\bpriority\s*[:-]?\s*(\d)\b/i,
];

// Action verbs that indicate a task or reminder
const ACTION_VERBS = [
  'remind', 'remember', 'call', 'email', 'message', 'text', 'buy', 'purchase',
  'pay', 'schedule', 'book', 'reserve', 'get', 'pick up', 'meet', 'attend',
  'finish', 'complete', 'submit', 'send', 'review', 'check'
];

/**
 * Extract date entities from text using rule-based patterns
 */
function extractDates(text: string): DateTimeEntity[] {
  console.log('Extracting dates from:', text);
  const entities: DateTimeEntity[] = [];
  const lowerText = text.toLowerCase();
  
  // For demonstration purposes, we're using simple regex matching
  // In a production environment, use a proper date parsing library like date-fns or Chrono
  
  if (lowerText.includes('tomorrow')) {
    console.log('Found "tomorrow" keyword in text');
  }
  
  for (const pattern of DATE_PATTERNS) {
    // Better debug by showing pattern source
    console.log(`Testing date pattern: ${pattern.toString()}`);
    
    const matches = text.match(pattern);
    if (matches) {
      console.log('Date match found:', matches);
      entities.push({
        type: EntityType.DATE,
        value: matches[0],
        originalText: matches[0],
        confidence: 0.8, // High confidence for regex matches
        metadata: {
          iso8601: '', // Would be populated with actual date in full implementation
          isRelative: /today|tomorrow|yesterday|next|this|last|in/.test(matches[0]),
          specificTime: false
        }
      });
    }
  }
  
  console.log('Extracted date entities:', entities);
  return entities;
}

/**
 * Extract time entities from text using rule-based patterns
 */
function extractTimes(text: string): DateTimeEntity[] {
  console.log('Extracting times from:', text);
  const entities: DateTimeEntity[] = [];
  
  for (const pattern of TIME_PATTERNS) {
    console.log(`Testing time pattern: ${pattern.toString()}`);
    const matches = text.match(pattern);
    if (matches) {
      console.log('Time match found:', matches);
      entities.push({
        type: EntityType.TIME,
        value: matches[0],
        originalText: matches[0],
        confidence: 0.8,
        metadata: {
          iso8601: '', // Would be populated with actual time in full implementation
          specificTime: true
        }
      });
    }
  }
  
  console.log('Extracted time entities:', entities);
  return entities;
}

/**
 * Extract combined date and time entities
 */
function extractDateTimes(text: string): DateTimeEntity[] {
  console.log('Extracting date/times from:', text);
  const dates = extractDates(text);
  const times = extractTimes(text);
  const dateTimeEntities: DateTimeEntity[] = [];
  
  console.log('Found dates:', dates.length, 'Found times:', times.length);
  
  // If we have both dates and times, create datetime entities
  if (dates.length > 0 && times.length > 0) {
    console.log('Creating combined date/time entity');
    // For now, we'll just combine the first date with the first time
    // A more sophisticated approach would analyze proximity in the text
    dateTimeEntities.push({
      type: EntityType.DATETIME,
      value: `${dates[0].value} ${times[0].value}`,
      originalText: `${dates[0].originalText} ${times[0].originalText}`,
      confidence: Math.min(dates[0].confidence, times[0].confidence),
      metadata: {
        iso8601: '', // Would be combined date+time in ISO format
        isRelative: dates[0].metadata.isRelative,
        specificTime: times[0].metadata.specificTime
      }
    });
  }
  
  console.log('All date/time entities:', [...dates, ...times, ...dateTimeEntities]);
  return [...dates, ...times, ...dateTimeEntities];
}

/**
 * Extract action entities from text
 */
function extractActions(text: string): ActionEntity[] {
  console.log('Extracting actions from:', text);
  const entities: ActionEntity[] = [];
  const lowerText = text.toLowerCase();
  
  for (const verb of ACTION_VERBS) {
    console.log(`Testing action verb: "${verb}"`);
    if (lowerText.includes(verb)) {
      console.log(`Found action verb: "${verb}"`);
      // Extract a simple verb+object pattern
      const regex = new RegExp(`\\b${verb}\\b\\s+(?:me\\s+)?(?:to\\s+)?([\\w\\s]+)`, 'i');
      const matches = text.match(regex);
      
      if (matches) {
        console.log('Action match found:', matches);
        entities.push({
          type: EntityType.ACTION,
          value: matches[0],
          originalText: matches[0],
          confidence: verb === 'remind' ? 0.9 : 0.7, // Higher confidence for explicit reminders
          metadata: {
            verb: verb,
            object: matches[1]?.trim(),
            isReminder: verb === 'remind' || verb === 'remember'
          }
        });
      }
    }
  }
  
  console.log('Extracted action entities:', entities);
  return entities;
}

/**
 * Extract priority entities from text
 */
function extractPriorities(text: string): PriorityEntity[] {
  console.log('Extracting priorities from:', text);
  const entities: PriorityEntity[] = [];
  
  for (const pattern of PRIORITY_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      console.log('Priority match found:', matches);
      let level: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
      let numeric: number | undefined = undefined;
      
      // Determine the priority level
      const match = matches[0].toLowerCase();
      if (/(urgent|asap|immediately|critical)/.test(match)) {
        level = 'urgent';
      } else if (/high/.test(match)) {
        level = 'high';
      } else if (/medium|important/.test(match)) {
        level = 'medium';
      } else if (/low|whenever|not\s+urgent/.test(match)) {
        level = 'low';
      }
      
      // Check for numeric priority
      const numMatch = match.match(/(\d)/);
      if (numMatch) {
        numeric = parseInt(numMatch[1], 10);
      }
      
      entities.push({
        type: EntityType.PRIORITY,
        value: matches[0],
        originalText: matches[0],
        confidence: 0.75,
        metadata: {
          level,
          numeric
        }
      });
    }
  }
  
  console.log('Extracted priority entities:', entities);
  return entities;
}

/**
 * Extract all entities from text using rule-based approach
 * Exported to allow direct testing
 */
export function extractEntitiesRuleBased(text: string): Entity[] {
  console.log('Rule-based extraction for text:', text);
  
  // Get all entities
  const dateTimeEntities = extractDateTimes(text);
  console.log('Date/time entities:', dateTimeEntities);
  
  const actionEntities = extractActions(text);
  console.log('Action entities:', actionEntities);
  
  const priorityEntities = extractPriorities(text);
  console.log('Priority entities:', priorityEntities);
  
  const allEntities = [
    ...dateTimeEntities, 
    ...actionEntities,
    ...priorityEntities
  ];
  
  console.log('All extracted entities:', allEntities);
  return allEntities;
}

/**
 * Extract entities using AI assistance
 */
export async function extractEntitiesWithAI(text: string): Promise<Entity[]> {
  console.log('extractEntitiesWithAI called with text:', text);
  
  try {
    // First, try rule-based extraction
    const ruleBasedEntities = extractEntitiesRuleBased(text);
    
    // Prepare the prompt for AI
    const prompt = `
      Analyze the following text and extract structured entities such as dates, times, actions, and priorities:
      
      "${text}"
      
      Return a JSON object with the following structure:
      {
        "entities": [
          {
            "type": "date|time|datetime|action|priority",
            "value": "extracted value",
            "originalText": "text as it appeared",
            "confidence": 0.0-1.0,
            "metadata": {}
          }
        ]
      }
      
      For dates, include iso8601 format in metadata.
      For times, specify if it's a specific time.
      For actions, include the verb and object.
      For priorities, specify the level (low, medium, high, urgent).
      
      Only respond with valid JSON. Make sure to maintain high precision - only extract entities that are clearly present in the text.
    `;
    
    // Send prompt to AI
    const response = await sendPrompt(prompt);
    
    try {
      // Parse the response
      const jsonStart = response.content.indexOf('{');
      const jsonEnd = response.content.lastIndexOf('}') + 1;
      const jsonStr = response.content.substring(jsonStart, jsonEnd);
      const parsed = JSON.parse(jsonStr);
      
      if (parsed && parsed.entities && Array.isArray(parsed.entities)) {
        // Merge AI entities with rule-based ones, preferring higher confidence
        const mergedEntities = [...ruleBasedEntities];
        
        for (const aiEntity of parsed.entities) {
          // Find if we already have this entity
          const existingIndex = mergedEntities.findIndex(e => 
            e.type === aiEntity.type && e.value === aiEntity.value);
          
          if (existingIndex >= 0) {
            // If AI has higher confidence, replace the entity
            if (aiEntity.confidence > mergedEntities[existingIndex].confidence) {
              mergedEntities[existingIndex] = aiEntity;
            }
          } else {
            // Add new entity
            mergedEntities.push(aiEntity);
          }
        }
        
        return mergedEntities;
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
    }
    
    // Fallback to rule-based if AI fails
    return ruleBasedEntities;
    
  } catch (error) {
    console.error('Error in AI entity extraction:', error);
    // Fallback to rule-based extraction
    return extractEntitiesRuleBased(text);
  }
}

/**
 * Extract all entities from the text
 */
export async function extractEntities(
  text: string, 
  useAI: boolean = true
): Promise<Entity[]> {
  console.log('extractEntities called with text:', text, 'useAI:', useAI);
  
  let entities: Entity[];
  if (useAI) {
    console.log('Using AI-based extraction');
    entities = await extractEntitiesWithAI(text);
  } else {
    console.log('Using rule-based extraction');
    entities = extractEntitiesRuleBased(text);
  }
  
  console.log('Extracted entities:', entities);
  return entities;
}