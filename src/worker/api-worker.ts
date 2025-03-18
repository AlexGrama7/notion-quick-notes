// Web Worker for API operations
import { invoke } from '@tauri-apps/api/tauri';

type WorkerMessage = {
  type: string;
  payload: any;
};

// Handle messages from the main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    let result;
    
    switch (type) {
      case 'appendNote':
        result = await invoke('append_note', { noteText: payload.noteText });
        self.postMessage({ type: 'appendNoteResult', success: true });
        break;
        
      case 'searchPages':
        result = await invoke('search_notion_pages');
        self.postMessage({ 
          type: 'searchPagesResult', 
          success: true, 
          data: result 
        });
        break;
        
      case 'verifyToken':
        result = await invoke('set_notion_api_token', { apiToken: payload.apiToken });
        self.postMessage({ 
          type: 'verifyTokenResult', 
          success: true, 
          valid: result 
        });
        break;
        
      case 'saveSelectedPage':
        await invoke('set_selected_page_id', { 
          pageId: payload.pageId,
          pageTitle: payload.pageTitle
        });
        self.postMessage({ 
          type: 'saveSelectedPageResult', 
          success: true 
        });
        break;
        
      default:
        self.postMessage({
          type: 'error',
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: `${type}Result`,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Required for TypeScript to recognize this as a module
export {}; 