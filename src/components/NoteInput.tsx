import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './NoteInput.css';

const NoteInput: React.FC = () => {
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [note]);
  
  const handleSave = async () => {
    if (!note.trim()) {
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      await invoke('append_note', { noteText: note });
      setNote('');
      handleCancel(); // Close the window after saving
    } catch (err) {
      setError(`Error: ${err}`);
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

  return (
    <div className="note-input-container">
      <div className="titlebar">
        <div className="titlebar-text">Quick Note</div>
        <div className="titlebar-controls">
          <button className="close-button" onClick={handleClose}>×</button>
        </div>
      </div>
      
      <textarea
        ref={textareaRef}
        className="note-textarea"
        placeholder="Type your note here..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      
      {error && <div className="error-message">{error}</div>}
      
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
