// Offline Queue System for Notion Quick Notes
// Handles storage and management of notes when offline

// Define the queue item interface
export interface QueuedNote {
  id: string;
  content: string;
  pageId: string;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  retryCount: number;
  lastError?: string;
}

// Constants for the IndexedDB configuration
const DB_NAME = 'NotionQuickNotesOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offlineNotes';

// Initialize the IndexedDB database
async function initializeDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('Failed to open offline database:', event);
      reject(new Error('Failed to open offline database'));
    };
    
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create the object store for our offline notes
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        
        // Create indexes for efficient retrieval
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('pageId', 'pageId', { unique: false });
        
        console.log('Offline note store created');
      }
    };
  });
}

// Core queue management functions

// Add a note to the offline queue
export async function addToQueue(content: string, pageId: string): Promise<QueuedNote> {
  const db = await initializeDB();
  
  const queuedNote: QueuedNote = {
    id: crypto.randomUUID(),
    content,
    pageId,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.add(queuedNote);
    
    request.onsuccess = () => {
      console.log('Note added to offline queue:', queuedNote.id);
      resolve(queuedNote);
    };
    
    request.onerror = (event) => {
      console.error('Failed to add note to offline queue:', event);
      reject(new Error('Failed to add note to offline queue'));
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// Get all queued notes, optionally filtered by status
export async function getQueuedNotes(status?: QueuedNote['status']): Promise<QueuedNote[]> {
  const db = await initializeDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    let request: IDBRequest;
    
    if (status) {
      const index = store.index('status');
      request = index.getAll(status);
    } else {
      request = store.getAll();
    }
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = (event) => {
      console.error('Failed to retrieve queued notes:', event);
      reject(new Error('Failed to retrieve queued notes'));
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// Update the status of a note in the queue
export async function updateNoteStatus(
  noteId: string, 
  status: QueuedNote['status'], 
  error?: string
): Promise<QueuedNote | null> {
  const db = await initializeDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // First get the current note
    const getRequest = store.get(noteId);
    
    getRequest.onsuccess = () => {
      const note = getRequest.result as QueuedNote;
      
      if (!note) {
        resolve(null);
        return;
      }
      
      // Update the note
      const updatedNote = {
        ...note,
        status,
        lastError: error,
        retryCount: status === 'failed' ? note.retryCount + 1 : note.retryCount
      };
      
      const updateRequest = store.put(updatedNote);
      
      updateRequest.onsuccess = () => {
        console.log(`Note ${noteId} status updated to ${status}`);
        resolve(updatedNote);
      };
      
      updateRequest.onerror = (event) => {
        console.error('Failed to update note status:', event);
        reject(new Error('Failed to update note status'));
      };
    };
    
    getRequest.onerror = (event) => {
      console.error('Failed to retrieve note for status update:', event);
      reject(new Error('Failed to retrieve note for status update'));
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// Remove a note from the queue
export async function removeFromQueue(noteId: string): Promise<boolean> {
  const db = await initializeDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.delete(noteId);
    
    request.onsuccess = () => {
      console.log(`Note ${noteId} removed from queue`);
      resolve(true);
    };
    
    request.onerror = (event) => {
      console.error('Failed to remove note from queue:', event);
      reject(new Error('Failed to remove note from queue'));
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// Get the count of queued notes, optionally filtered by status
export async function getQueuedNoteCount(status?: QueuedNote['status']): Promise<number> {
  const notes = await getQueuedNotes(status);
  return notes.length;
}