import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './NoteInput.css';

const NoteInput: React.FC = () => {
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
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
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Add online/offline event listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [note]);
  
  const handleSave = async () => {
    if (!note.trim()) {
      return;
    }
    
    if (isOffline) {
      setError('You appear to be offline. Can\'t save note at the moment.');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      await invoke('append_note', { noteText: note });
      setNote('');
      handleCancel(); // Close the window after saving
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
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    invoke('close_note_input');
  };
  
  const handleClose = () => {
    invoke('close_note_input');
  };
  
  const openSettings = () => {
    invoke('show_settings');
    // Close the current window after opening settings
    invoke('close_note_input');
  };
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

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
      
      <textarea
        ref={textareaRef}
        className="note-textarea"
        placeholder="Type your note here..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      
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
      
      <div className="button-container">
        <button 
          className="cancel-button" 
          onClick={handleCancel}
          disabled={isSaving}
        >
          Cancel (Esc)
        </button>
        <button 
          className="save-button" 
          onClick={handleSave}
          disabled={isSaving || !note.trim()}
        >
          {isSaving ? 'Saving...' : 'Save (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  );
};

export default NoteInput;
