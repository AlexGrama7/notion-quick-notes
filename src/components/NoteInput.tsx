import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './NoteInput.css';
import { getSyncService } from '../services/syncService';
import { getNetworkStatus } from '../services/networkStatus';
import { initializeAIService } from '../services/ai';
import { initializeNLPService, processNaturalLanguage } from '../services/nlp/nlpService';
import { ProcessingResult } from '../services/nlp/types';
import SyncStatus from './SyncStatus';
import RateLimitIndicator from './RateLimitIndicator';
import AIAssistant from './AIAssistant';
import NLPDetection from './NLPDetection';

// Define types for the enhanced error responses
interface ErrorResponse {
  code: string;
  message: string;
  user_message: string;
  details?: string;
  recovery_action: 'Retry' | 'RetryLater' | 'OpenSettings' | 'CheckConnection' | 'CheckPageAccess' | 'Restart' | 'None';
  severity: 'Info' | 'Warning' | 'Error' | 'Critical';
}

const NoteInput: React.FC = () => {
  const [note, setNote] = useState('');
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [isOffline, setIsOffline] = useState(() => !getNetworkStatus().isNetworkOnline());
  const [sendStatus, setSendStatus] = useState<null | 'sending' | 'sent'>(null);
  const [darkMode, setDarkMode] = useState(() => {
    // Check if user previously had dark mode enabled
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });
  const [isAIInitialized, setIsAIInitialized] = useState(false);
  const [isNLPInitialized, setIsNLPInitialized] = useState(false);
  const [processingNLP, setProcessingNLP] = useState(false);
  const [nlpResult, setNlpResult] = useState<ProcessingResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Apply theme when component mounts and when darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Initialize AI service
  useEffect(() => {
    if (!isAIInitialized) {
      try {
        initializeAIService();
        setIsAIInitialized(true);
      } catch (error) {
        console.error('Failed to initialize AI service:', error);
      }
    }
  }, [isAIInitialized]);

  // Initialize NLP service
  useEffect(() => {
    if (!isNLPInitialized) {
      try {
        initializeNLPService();
        setIsNLPInitialized(true);
      } catch (error) {
        console.error('Failed to initialize NLP service:', error);
      }
    }
  }, [isNLPInitialized]);
  
  // Create a helper function to create error objects
  const createErrorObject = (
    code: string,
    user_message: string,
    recovery_action: ErrorResponse['recovery_action'] = 'None',
    severity: ErrorResponse['severity'] = 'Error'
  ): ErrorResponse => {
    return {
      code,
      message: user_message, // Technical message same as user message for local errors
      user_message,
      recovery_action,
      severity
    };
  };

  // Get selected page ID for sending notes
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  
  // Fetch the selected page ID on component mount
  useEffect(() => {
    const fetchSelectedPage = async () => {
      try {
        const pageId = await invoke<string>('get_selected_page_id');
        setSelectedPageId(pageId);
      } catch (error) {
        console.error('Failed to get selected page ID:', error);
      }
    };
    
    fetchSelectedPage();
  }, []);
  
  // Memoize handlers to prevent recreation on every render
  const handleSave = useCallback(async () => {
    if (!note.trim()) {
      return;
    }
    
    setSendStatus('sending');
    setError(null);
    
    try {
      const syncService = getSyncService();
      
      // If we have processed NLP results with high confidence, use the structured data
      let sentDirectly = false;
      
      if (nlpResult && nlpResult.confidence > 0.7 && nlpResult.structuredData) {
        // Send structured data - in a full implementation, this would create
        // a properly formatted Notion database entry
        sentDirectly = await syncService.addNote(
          nlpResult.structuredData.title || note,
          selectedPageId
        );
        
        // TODO: In future implementation, this would use a different API call
        // to create a database entry with proper date/time fields
        console.log('Sending structured data to Notion:', nlpResult.structuredData);
      } else {
        // Use the regular sync service to add the note without structure
        sentDirectly = await syncService.addNote(note, selectedPageId);
      }
      
      // Reset note input regardless of whether it was queued or sent directly
      setNote('');
      
      if (sentDirectly) {
        // If sent directly to Notion, show sent message
        setSendStatus('sent');
        
        // Show success notification for 6 seconds before closing window
        // Extended display time ensures users cannot miss the confirmation
        console.log("Note successfully sent to Notion!");
        setTimeout(() => {
          setSendStatus(null);
          handleCancel(); // Close the window after showing sent message
        }, 6000);
      } else if (!isOffline) {
        // If online but queued (e.g., for rate limiting reasons)
        setSendStatus('sent');
        setError(createErrorObject(
          'NOTE_QUEUED',
          'Note has been queued for sending.',
          'None',
          'Info'
        ));
        
        // Don't close the window automatically in this case
        setTimeout(() => {
          setSendStatus(null);
        }, 2000);
      } else {
        // If offline and queued
        setSendStatus(null);
        setError(createErrorObject(
          'OFFLINE_QUEUED',
          "You're offline. Note has been saved and will be sent when you're back online.",
          'None',
          'Info'
        ));
      }
    } catch (err) {
      // Parse the error response if it's an object
      if (typeof err === 'object' && err !== null) {
        // Our custom error response from backend
        const errorResponse = err as ErrorResponse;
        if (errorResponse.user_message) {
          setError(errorResponse);
        } else {
          // Generic object error
          setError(createErrorObject(
            'UNKNOWN_ERROR',
            `Error: ${JSON.stringify(err)}`,
            'None',
            'Error'
          ));
        }
      } else if (typeof err === 'string') {
        // Handle string errors (legacy format)
        if (err.includes('network')) {
          setError(createErrorObject(
            'NETWORK_ERROR',
            'Network error: Please check your internet connection and try again.',
            'CheckConnection',
            'Warning'
          ));
        } else if (err.includes('token')) {
          setError(createErrorObject(
            'NOTION_AUTH_ERROR',
            'API token error: Please go to Settings and verify your Notion API token.',
            'OpenSettings',
            'Error'
          ));
        } else if (err.includes('page')) {
          setError(createErrorObject(
            'NOTION_PAGE_ERROR',
            'Page error: Please go to Settings and verify your selected Notion page.',
            'OpenSettings',
            'Error'
          ));
        } else {
          setError(createErrorObject(
            'UNKNOWN_ERROR',
            `Error: ${err}`,
            'None',
            'Error'
          ));
        }
      } else {
        // Fallback for other error types
        setError(createErrorObject(
          'UNKNOWN_ERROR',
          'An unknown error occurred.',
          'None',
          'Error'
        ));
      }
      setSendStatus(null);
    }
  }, [note, isOffline, selectedPageId]);
  
  const handleCancel = useCallback(() => {
    invoke('close_note_input');
  }, []);
  
  const handleClose = useCallback(() => {
    invoke('close_note_input');
  }, []);
  
  const openSettings = useCallback(async () => {
    try {
      // First close the note input window
      await invoke('close_note_input');
      
      // Then show settings (will reuse existing window if present)
      await invoke('show_settings');
    } catch (err) {
      console.error("Error switching to settings:", err);
    }
  }, []);
  
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prevMode => !prevMode);
  }, []);

  // Optimized event handler setup to only run once
  useEffect(() => {
    // Focus the textarea when the component mounts
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    
    // Add keyboard event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        handleSave();
      }
    };
    
    // Add network status listener
    const networkStatus = getNetworkStatus();
    const handleNetworkStatusChange = (status: 'online' | 'offline' | 'reconnected') => {
      setIsOffline(status === 'offline');
    };
    
    networkStatus.addListener(handleNetworkStatusChange);
    window.addEventListener('keydown', handleKeyDown);
    
    // Start periodic connectivity checks
    networkStatus.startPeriodicChecks(30000); // Check every 30 seconds
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      networkStatus.removeListener(handleNetworkStatusChange);
      networkStatus.stopPeriodicChecks();
    };
  }, [handleSave, handleCancel]);
  
  // Process text with NLP when it potentially contains action items
  const processTextWithNLP = useCallback(async (text: string): Promise<void> => {
    if (!isNLPInitialized || !text.trim()) {
      return;
    }
    
    console.log('Processing text with NLP:', text);
    
    try {
      setProcessingNLP(true);
      const result = await processNaturalLanguage(text);
      console.log('NLP processing result:', result);
      setNlpResult(result);
      setProcessingNLP(false);
    } catch (error) {
      console.error('Error processing text with NLP:', error);
      setProcessingNLP(false);
      setNlpResult(null);
    }
  }, [isNLPInitialized]);

  // Text change handler with NLP processing
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setNote(newText);
    
    // If the text contains potential reminder keywords, process with NLP
    // This is a simple heuristic to avoid processing every keystroke
    const reminderKeywords = [
      // Time-related keywords
      'tomorrow', 'today', 'next week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      // Reminder keywords
      'remind', 'remember', 'schedule', 'meeting', 'appointment',
      // Action verbs that should trigger NLP
      'call', 'email', 'message', 'text', 'buy', 'purchase', 'pay', 'book', 'reserve', 'pick up', 'meet', 'attend'
    ];
    const shouldProcess = reminderKeywords.some(keyword => newText.toLowerCase().includes(keyword));
    
    // Debug keywords that triggered NLP
    if (shouldProcess) {
      const matchedKeywords = reminderKeywords.filter(keyword =>
        newText.toLowerCase().includes(keyword));
      console.log('NLP Keywords matched:', matchedKeywords);
    }
    
    if (shouldProcess && isNLPInitialized) {
      // Debounce the NLP processing to avoid excessive API calls
      // Only process after user has stopped typing for 800ms
      const timeoutId = setTimeout(() => {
        processTextWithNLP(newText);
      }, 800);
      
      // Clear timeout on component unmount or when text changes again
      return () => clearTimeout(timeoutId);
    }
  }, [isNLPInitialized, processTextWithNLP]);
  
  // Handle applying AI suggestions
  const handleApplySuggestion = useCallback((suggestion: string) => {
    // Append the suggestion to the current note
    setNote(currentNote => {
      // If the note already ends with a period, question mark, or exclamation point
      // we'll add a space. Otherwise, we'll add a period and a space.
      let connector = ' ';
      const lastChar = currentNote.trim().slice(-1);
      if (!['.', '!', '?'].includes(lastChar) && currentNote.trim().length > 0) {
        connector = '. ';
      }
      
      return currentNote.trim() + connector + suggestion;
    });
    
    // Focus the textarea after applying
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);
  
  return (
    <div className="note-input-container">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-text" data-tauri-drag-region>Quick Note</div>
        <div className="titlebar-controls">
          <RateLimitIndicator
            size={18}
            className="titlebar-rate-limit"
            showTooltip={true}
            showLabel={false}
          />
          <button className="titlebar-button" onClick={openSettings} title="Settings">
            ⚙️
          </button>
          <button className="titlebar-button" onClick={toggleDarkMode} title="Toggle Dark Mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button className="titlebar-button" onClick={handleClose} title="Close">
            ✕
          </button>
        </div>
      </div>
      
      {isOffline && (
        <div className="offline-banner">
          You're currently offline. Notes will be saved when you're back online.
        </div>
      )}
      
      {/* Sync Status Component */}
      <SyncStatus className="note-sync-status" />
      
      <textarea
        ref={textareaRef}
        className="note-textarea"
        placeholder="Type your note here..."
        value={note}
        onChange={handleTextChange}
        style={{
          direction: 'ltr',
          textAlign: 'left'
        }}
        data-text-direction="normal"
      />
      
      {/* Debug buttons - only in development */}
      <div style={{ position: "absolute", top: "10px", right: "170px" }}>
        <button
          style={{
            padding: "2px 8px",
            background: "#ff5500",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "12px",
            marginRight: "5px"
          }}
          onClick={() => {
            console.log('Force processing NLP for:', note);
            processTextWithNLP(note);
          }}
        >
          Process NLP
        </button>

        <button
          style={{
            padding: "2px 8px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "12px"
          }}
          onClick={() => {
            try {
              // Direct check for entity extraction, bypassing the full NLP pipeline
              import('../services/nlp/entityExtractor').then(module => {
                const entities = module.extractEntitiesRuleBased(note);
                
                // Display results in a more visible way
                console.log('Direct entity extraction results:', entities);
                
                // Create a temporary div to show results for debugging
                const resultDiv = document.createElement('div');
                resultDiv.style.position = 'fixed';
                resultDiv.style.top = '100px';
                resultDiv.style.left = '50%';
                resultDiv.style.transform = 'translateX(-50%)';
                resultDiv.style.padding = '15px';
                resultDiv.style.background = '#333';
                resultDiv.style.color = '#fff';
                resultDiv.style.zIndex = '9999';
                resultDiv.style.borderRadius = '5px';
                resultDiv.style.maxWidth = '80%';
                
                resultDiv.innerHTML = `
                  <h3 style="margin-top:0">Entity Test Results</h3>
                  <p>Found ${entities.length} entities in text: "${note}"</p>
                  <ul style="padding-left:20px">
                    ${entities.map((e: any) => `<li>${e.type}: "${e.value}" (${Math.round(e.confidence * 100)}% confidence)</li>`).join('')}
                  </ul>
                  <button id="close-debug" style="margin-top:10px;padding:5px;cursor:pointer">Close</button>
                `;
                
                document.body.appendChild(resultDiv);
                
                // Add event listener to close button
                document.getElementById('close-debug')?.addEventListener('click', () => {
                  document.body.removeChild(resultDiv);
                });
              });
            } catch (error) {
              console.error('Error in direct entity extraction:', error);
            }
          }}
        >
          Test Entities
        </button>
      </div>
      
      {/* NLP Detection Component */}
      {nlpResult && !processingNLP && (
        <NLPDetection
          result={nlpResult}
          onConfirm={(structuredData) => {
            // Use the structured data directly
            // In a full implementation, this would populate database fields
            console.log('Using structured data:', structuredData);
            
            // Clear NLP result after confirmation
            setNlpResult(null);
            
            // Trigger save with the structured data
            handleSave();
          }}
          onDiscard={() => {
            // Clear NLP result if the user discards it
            setNlpResult(null);
          }}
        />
      )}
      
      {/* AI Assistant Component */}
      {isAIInitialized && (
        <AIAssistant
          noteContent={note}
          onSuggestionApply={handleApplySuggestion}
        />
      )}
      
      {error && (
        <div className={`error-message error-severity-${error.severity.toLowerCase()}`}>
          {error.user_message}
          
          {/* Show appropriate action button based on recovery action */}
          {error.recovery_action === 'OpenSettings' && (
            <button className="error-action-button" onClick={openSettings}>
              Open Settings
            </button>
          )}
          
          {error.recovery_action === 'Retry' && (
            <button className="error-action-button" onClick={handleSave}>
              Try Again
            </button>
          )}
          
          {error.recovery_action === 'CheckConnection' && (
            <button className="error-action-button" onClick={() => setError(null)}>
              Check Connection
            </button>
          )}
          
          {/* Add details expander if details exist */}
          {error.details && (
            <div className="error-details">
              <details>
                <summary>More details</summary>
                <div className="error-details-content">
                  {error.details}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
      
      {sendStatus && (
        <div className={`status-bar ${sendStatus}`}>
          <span className="status-text">
            {sendStatus === 'sending' ? 'Sending...' : 'Note sent successfully!'}
          </span>
        </div>
      )}
    </div>
  );
};

// Export as React.memo to prevent unnecessary re-renders at the component level
export default memo(NoteInput);
