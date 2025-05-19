import React from 'react';
import { ProcessingResult, EntityType, NotionDatabaseItem } from '../services/nlp/types';
import './NLPDetection.css';

interface NLPDetectionProps {
  result: ProcessingResult;
  onConfirm: (structuredData: NotionDatabaseItem) => void;
  onDiscard: () => void;
}

/**
 * NLPDetection Component
 * 
 * Displays detected entities from natural language processing and allows
 * the user to confirm or discard the structured interpretation.
 */
// Changed to export default to match import in NoteInput.tsx
const NLPDetection: React.FC<NLPDetectionProps> = ({
  result,
  onConfirm,
  onDiscard
}) => {
  console.log('NLPDetection component rendering with result:', result);
  
  if (!result) {
    console.log('NLPDetection: No result, returning null');
    return null;
  }
  
  if (!result.entities || result.entities.length === 0) {
    console.log('NLPDetection: No entities to display, returning null');
    return null;
  }
  
  // Get entity type display name
  const getEntityTypeDisplay = (type: EntityType): string => {
    switch (type) {
      case EntityType.DATE:
        return 'Date';
      case EntityType.TIME:
        return 'Time';
      case EntityType.DATETIME:
        return 'Date & Time';
      case EntityType.ACTION:
        return 'Action';
      case EntityType.PRIORITY:
        return 'Priority';
      case EntityType.PERSON:
        return 'Person';
      case EntityType.LOCATION:
        return 'Location';
      case EntityType.TOPIC:
        return 'Topic';
      default:
        return type;
    }
  };
  
  // Get confidence level text
  const getConfidenceText = (confidence: number): string => {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.5) return 'Medium';
    if (confidence >= 0.3) return 'Low';
    return 'Very Low';
  };
  
  // Handle confirmation button click
  const handleConfirm = () => {
    if (result.structuredData) {
      onConfirm(result.structuredData);
    }
  };
  
  return (
    <div className="nlp-detection">
      <div className="nlp-detection-header">
        <span>Intelligence detected</span>
        <div className="nlp-detection-confidence">
          <span>{getConfidenceText(result.confidence)}</span>
          <div className="nlp-detection-confidence-meter">
            <div 
              className="nlp-detection-confidence-fill" 
              style={{ width: `${result.confidence * 100}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="nlp-detection-content">
        {result.entities.map((entity, idx) => (
          <span 
            key={idx} 
            className={`nlp-detection-entity nlp-detection-entity-${entity.type.toLowerCase()}`}
            title={`${getEntityTypeDisplay(entity.type)} (${Math.round(entity.confidence * 100)}% confidence)`}
          >
            {entity.value}
          </span>
        ))}
      </div>
      
      {result.structuredData && (
        <div className="nlp-detection-structured">
          {result.structuredData.date && (
            <div className="nlp-detection-structured-item">
              <div className="nlp-detection-structured-label">Date:</div>
              <div>{result.structuredData.date}</div>
            </div>
          )}
          
          {result.structuredData.time && (
            <div className="nlp-detection-structured-item">
              <div className="nlp-detection-structured-label">Time:</div>
              <div>{result.structuredData.time}</div>
            </div>
          )}
          
          {result.structuredData.reminderTime && (
            <div className="nlp-detection-structured-item">
              <div className="nlp-detection-structured-label">Reminder:</div>
              <div>{result.structuredData.reminderTime}</div>
            </div>
          )}
          
          {result.structuredData.priority && (
            <div className="nlp-detection-structured-item">
              <div className="nlp-detection-structured-label">Priority:</div>
              <div>{result.structuredData.priority}</div>
            </div>
          )}
          
          <div className="nlp-detection-structured-item">
            <div className="nlp-detection-structured-label">Title:</div>
            <div>{result.structuredData.title}</div>
          </div>
        </div>
      )}
      
      <div className="nlp-detection-buttons">
        <button 
          className="nlp-detection-button-cancel"
          onClick={onDiscard}
        >
          Ignore
        </button>
        
        {result.structuredData && (
          <button 
            className="nlp-detection-button"
            onClick={handleConfirm}
          >
            Use this format
          </button>
        )}
      </div>
    </div>
  );
};

export default NLPDetection;