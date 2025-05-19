// Sync Service for Notion Quick Notes
// Handles synchronization of offline notes with the Notion API

import { QueuedNote, addToQueue, getQueuedNotes, updateNoteStatus, removeFromQueue } from './offlineQueue';
import { getNetworkStatus, NetworkStatusEvent } from './networkStatus';
import { invoke } from '@tauri-apps/api/tauri';

// Configuration options for the sync service
export interface SyncConfig {
  // How often to attempt sync (in milliseconds) when online
  syncInterval: number;
  
  // Maximum number of retry attempts for failed notes
  maxRetries: number;
  
  // Whether to automatically sync when coming back online
  autoSyncOnReconnect: boolean;
  
  // Initial delay before first retry (in milliseconds)
  initialRetryDelay: number;
  
  // Maximum delay between retries (in milliseconds)
  maxRetryDelay: number;
  
  // Whether to show notifications for sync events
  showNotifications: boolean;
}

// Default sync configuration
const DEFAULT_CONFIG: SyncConfig = {
  syncInterval: 60000, // 1 minute
  maxRetries: 5,
  autoSyncOnReconnect: true,
  initialRetryDelay: 5000, // 5 seconds
  maxRetryDelay: 300000, // 5 minutes
  showNotifications: true
};

// Sync status event types
export type SyncStatusEvent = 
  | 'idle' 
  | 'syncing' 
  | 'completed' 
  | 'failed' 
  | 'offline';

// Sync status listener type
export type SyncStatusListener = (status: SyncStatusEvent, details?: any) => void;

// Class to handle sync between offline queue and Notion API
export class SyncService {
  private static instance: SyncService;
  private config: SyncConfig = DEFAULT_CONFIG;
  private syncInterval: number | null = null;
  private isSyncing = false;
  private listeners: SyncStatusListener[] = [];
  private lastSyncTime: number | null = null;

  // Get the singleton instance
  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  // Private constructor to enforce singleton pattern
  private constructor() {
    this.initialize();
  }

  // Initialize the sync service
  private initialize(): void {
    // Listen for network status changes
    const networkStatus = getNetworkStatus();
    networkStatus.addListener(this.handleNetworkStatusChange);

    // Start periodic sync if online
    if (networkStatus.isNetworkOnline()) {
      this.startPeriodicSync();
    }
  }

  // Set custom configuration
  public configure(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart sync with new interval if needed
    if (this.syncInterval !== null) {
      this.stopPeriodicSync();
      this.startPeriodicSync();
    }
  }

  // Handle network status changes
  private handleNetworkStatusChange = (status: NetworkStatusEvent): void => {
    if (status === 'online' || status === 'reconnected') {
      // Start periodic sync when online
      this.startPeriodicSync();
      
      // Auto-sync immediately on reconnection if configured
      if (status === 'reconnected' && this.config.autoSyncOnReconnect) {
        this.syncNow();
      }
    } else if (status === 'offline') {
      // Stop periodic sync when offline
      this.stopPeriodicSync();
      this.notifyListeners('offline');
    }
  };

  // Start periodic sync
  private startPeriodicSync(): void {
    if (this.syncInterval !== null) {
      return; // Already running
    }
    
    this.syncInterval = window.setInterval(() => {
      this.syncNow();
    }, this.config.syncInterval);
  }

  // Stop periodic sync
  private stopPeriodicSync(): void {
    if (this.syncInterval !== null) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Calculate backoff delay for retries using exponential backoff
  // Commented out until needed to avoid TypeScript warnings
  // private calculateBackoffDelay(retryCount: number): number {
  //   const delay = this.config.initialRetryDelay * Math.pow(2, retryCount);
  //   return Math.min(delay, this.config.maxRetryDelay);
  // }

  // Sync a specific note with Notion
  private async syncNote(note: QueuedNote): Promise<boolean> {
    try {
      // Update status to syncing
      await updateNoteStatus(note.id, 'syncing');
      
      // Get page information if possible
      // Commented out until needed for UI display
      // try {
      //   const response = await invoke<any>('get_page_info', {
      //     pageId: note.pageId
      //   });
      //   // Page title will be used in future UI updates
      // } catch (e) {
      //   console.warn("Could not get page title:", e);
      // }
      
      // Invoke Tauri command to append note to Notion
      await invoke('append_note', {
        noteText: note.content,
        state: { selectedPageId: note.pageId }
      });
      
      // Success - remove note from queue
      await removeFromQueue(note.id);
      
      // Successfully synced note
      
      console.log(`Successfully synced note ${note.id}`);
      return true;
    } catch (error) {
      // Handle errors
      console.error(`Failed to sync note ${note.id}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Update note status
      if (note.retryCount >= this.config.maxRetries) {
        // Max retries reached - mark as failed
        await updateNoteStatus(note.id, 'failed', errorMessage);
      } else {
        // Schedule for retry - mark as pending
        await updateNoteStatus(note.id, 'pending', errorMessage);
      }
      
      return false;
    }
  }

  // Get pending notes and sync them
  public async syncNow(): Promise<boolean> {
    // Don't start a new sync if already syncing
    if (this.isSyncing) {
      return false;
    }
    
    // Check network status first
    const networkStatus = getNetworkStatus();
    if (!networkStatus.isNetworkOnline()) {
      this.notifyListeners('offline');
      return false;
    }
    
    // Verify connectivity with an active ping
    const isConnected = await networkStatus.pingForConnectivity();
    if (!isConnected) {
      this.notifyListeners('offline');
      return false;
    }
    
    try {
      this.isSyncing = true;
      this.notifyListeners('syncing');
      
      // Get all pending notes
      const pendingNotes = await getQueuedNotes('pending');
      
      if (pendingNotes.length === 0) {
        // Nothing to sync
        this.lastSyncTime = Date.now();
        this.isSyncing = false;
        this.notifyListeners('completed', { synced: 0, total: 0 });
        return true;
      }
      
      // Track successful and failed syncs
      let successCount = 0;
      let failCount = 0;
      
      // Sync each note in sequence
      for (const note of pendingNotes) {
        const success = await this.syncNote(note);
        success ? successCount++ : failCount++;
        
        // Yield control briefly to keep the UI responsive
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Update sync status
      this.lastSyncTime = Date.now();
      
      // Notify listeners of completion
      if (failCount > 0) {
        this.notifyListeners('failed', {
          synced: successCount,
          failed: failCount,
          total: pendingNotes.length
        });
      } else {
        this.notifyListeners('completed', {
          synced: successCount,
          total: pendingNotes.length
        });
      }
      
      return failCount === 0;
    } catch (error) {
      console.error('Sync error:', error);
      this.notifyListeners('failed', { error });
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  // Add a note to Notion, or to the offline queue if offline
  public async addNote(content: string, pageId: string): Promise<boolean> {
    const networkStatus = getNetworkStatus();
    
    // If online, try to send directly
    if (networkStatus.isNetworkOnline()) {
      try {
        // Try to append directly to Notion
        await invoke('append_note', {
          noteText: content,
          state: { selectedPageId: pageId }
        });
        
        // Note sent successfully
        
        return true;
      } catch (error) {
        console.warn('Failed to send note directly, adding to offline queue:', error);
        // Fall back to offline queue
      }
    }
    
    // Add to offline queue
    await addToQueue(content, pageId);
    
    // If we're online, trigger an immediate sync attempt
    if (networkStatus.isNetworkOnline() && !this.isSyncing) {
      setTimeout(() => this.syncNow(), 1000);
    }
    
    return false;
  }

  // Add a listener for sync status changes
  public addListener(listener: SyncStatusListener): void {
    if (!this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }

  // Remove a listener
  public removeListener(listener: SyncStatusListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Notify all listeners of a sync status change
  private notifyListeners(status: SyncStatusEvent, details?: any): void {
    this.listeners.forEach(listener => {
      try {
        listener(status, details);
      } catch (error) {
        console.error('Error in sync status listener:', error);
      }
    });
  }

  // Get time of last sync
  public getLastSyncTime(): number | null {
    return this.lastSyncTime;
  }

  // Check if a sync is currently in progress
  public isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  // Clean up resources when no longer needed
  public cleanup(): void {
    this.stopPeriodicSync();
    getNetworkStatus().removeListener(this.handleNetworkStatusChange);
    this.listeners = [];
  }
}

// Convenience function to get the singleton instance
export const getSyncService = (): SyncService => {
  return SyncService.getInstance();
};