import React, { useState, useCallback, useEffect } from 'react';
import './AIAssistant.css';
import { sendPrompt, getAIState, ModelResponse, ModelType } from '../services/ai';

interface AIAssistantProps {
  noteContent: string;
  onSuggestionApply: (suggestion: string) => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ noteContent, onSuggestionApply }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ModelType>(ModelType.GPT4o);

  // Update the active model whenever it changes
  useEffect(() => {
    const checkModel = () => {
      const aiState = getAIState();
      setActiveModel(aiState.activeModel);
    };
    
    // Initial check
    checkModel();
    
    // Set up interval to check model (in case it falls back)
    const interval = setInterval(checkModel, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const generateSuggestion = useCallback(async () => {
    if (!noteContent.trim()) {
      setError("Please enter some text first to generate suggestions.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create the prompt for the AI
      const prompt = `The following is a note that the user is writing: 

"${noteContent}"

Based on this note, provide a concise, helpful suggestion to improve or expand it. Focus on adding relevant details, clarifications, or next steps. Be brief and practical, with a focus on adding value. Respond only with the suggested text to add, without any explanations or prefacing.`;
      
      // Send the prompt to the AI service
      const response: ModelResponse = await sendPrompt(prompt);
      
      // Set the suggestion
      setSuggestion(response.content.trim());
      
      // Make sure the assistant is expanded to show the suggestion
      setIsExpanded(true);
    } catch (error: any) {
      console.error('AI suggestion error:', error);
      setError(error.message || 'Failed to generate suggestion. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [noteContent]);

  const applySuggestion = useCallback(() => {
    if (suggestion) {
      onSuggestionApply(suggestion);
      setSuggestion(null);
      setIsExpanded(false);
    }
  }, [suggestion, onSuggestionApply]);

  // Format model name for display
  const formatModelName = useCallback((model: ModelType) => {
    switch (model) {
      case ModelType.GPT4o:
        return 'GPT-4o';
      case ModelType.GPT4oMini:
        return 'GPT-4o Mini';
      default:
        return model;
    }
  }, []);

  if (!isExpanded) {
    return (
      <div className="ai-assistant-collapsed">
        <button
          className="ai-assistant-toggle-button"
          onClick={toggleExpand}
          title="AI Assistant"
        >
          <span className="ai-icon">✨</span> AI Assistant
        </button>
      </div>
    );
  }

  return (
    <div className="ai-assistant-expanded">
      <div className="ai-assistant-header">
        <div className="ai-assistant-title">
          <span className="ai-icon">✨</span> AI Assistant
          <span className="ai-model-badge">
            {formatModelName(activeModel)}
          </span>
        </div>
        <button
          className="ai-assistant-close"
          onClick={toggleExpand}
          title="Close AI Assistant"
        >
          ✕
        </button>
      </div>
      
      <div className="ai-assistant-content">
        {isLoading ? (
          <div className="ai-loading">
            <div className="ai-loading-animation">
              <div className="ai-loading-dot"></div>
              <div className="ai-loading-dot"></div>
              <div className="ai-loading-dot"></div>
            </div>
            <span>Generating suggestion...</span>
          </div>
        ) : error ? (
          <div className="ai-error">
            <p>{error}</p>
            <button 
              className="ai-retry-button"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : suggestion ? (
          <div className="ai-suggestion">
            <p className="ai-suggestion-text">{suggestion}</p>
            <div className="ai-suggestion-actions">
              <button 
                className="ai-apply-button"
                onClick={applySuggestion}
              >
                Apply Suggestion
              </button>
              <button 
                className="ai-secondary-button"
                onClick={() => setSuggestion(null)}
              >
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="ai-empty-state">
            <p>I can help improve your note or expand on your ideas.</p>
            <button 
              className="ai-generate-button"
              onClick={generateSuggestion}
            >
              Generate Suggestion
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant;