import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './NoteInput.css';

const NoteInput: React.FC = () => {
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [sendStatus, setSendStatus] = useState<null | 'sending' | 'sent'>(null);
  const [darkMode, setDarkMode] = useState(() => {
    // Check if user previously had dark mode enabled
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });
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
  
  // Memoize handlers to prevent recreation on every render
  const handleSave = useCallback(async () => {
    if (!note.trim()) {
      return;
    }
    
    if (isOffline) {
      setError('You appear to be offline. Can\'t save note at the moment.');
      return;
    }
    
    setIsSaving(true);
    setSendStatus('sending');
    setError(null);
    
    try {
      await invoke('append_note', { noteText: note });
      setNote('');
      setSendStatus('sent');
      
      // Clear the sent status after 2 seconds and close window
      setTimeout(() => {
        setSendStatus(null);
        handleCancel(); // Close the window after showing sent message
      }, 2000);
    } catch (err) {
      if (typeof err === 'string' && err.includes('network')) {
        setError('Network error: Please check your internet connection and try again.');
      } else if (typeof err === 'string' && err.includes('token')) {
        setError('API token error: Please go to Settings and verify your Notion API token.');
      } else if (typeof err === 'string' && err.includes('page')) {
        setError('Page error: Please go to Settings and verify your selected Notion page.');
      } else {
        setError(`Error: ${err}`);
      }
      setSendStatus(null);
    } finally {
      setIsSaving(false);
    }
  }, [note, isOffline]);
  
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
    
    // Add online/offline event listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleSave, handleCancel]);
  
  // Memoized TextArea component to prevent unnecessary re-renders
  const NoteTextArea = memo(() => (
    <textarea
      ref={textareaRef}
      className="note-textarea"
      placeholder="Type your note here..."
      value={note}
      onChange={(e) => setNote(e.target.value)}
    />
  ));
  NoteTextArea.displayName = 'NoteTextArea';

  return (
    <div className="note-input-container">
      <div className="titlebar">
        <div className="titlebar-text">Quick Note</div>
        <div className="titlebar-controls">
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
      
      <NoteTextArea />
      
      {error && (
        <div className="error-message">
          {error}
          {error.includes('token') || error.includes('page') ? (
            <button className="error-action-button" onClick={openSettings}>
              Open Settings
            </button>
          ) : null}
        </div>
      )}
      
      {sendStatus && (
        <div className={`status-bar ${sendStatus}`}>
          <span className="status-text">
            {sendStatus === 'sending' ? 'Sending...' : 'Sent.'}
          </span>
        </div>
      )}
    </div>
  );
};

// Export as React.memo to prevent unnecessary re-renders at the component level
export default memo(NoteInput);
