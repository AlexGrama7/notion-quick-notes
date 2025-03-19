// Network Status Service for Notion Quick Notes
// Handles detection of online/offline status and network events

// Network status event types
export type NetworkStatusEvent = 'online' | 'offline' | 'reconnected';

// Network status event listener type
export type NetworkStatusListener = (status: NetworkStatusEvent) => void;

// Class to handle network status
export class NetworkStatusService {
  private static instance: NetworkStatusService;
  private isOnline: boolean = navigator.onLine;
  private listeners: NetworkStatusListener[] = [];
  private reconnectTimeout: number | null = null;
  private lastOnlineTime: number | null = null;

  // Get the singleton instance
  public static getInstance(): NetworkStatusService {
    if (!NetworkStatusService.instance) {
      NetworkStatusService.instance = new NetworkStatusService();
    }
    return NetworkStatusService.instance;
  }

  // Private constructor to enforce singleton pattern
  private constructor() {
    this.initialize();
  }

  // Initialize event listeners
  private initialize(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Initial status
    if (this.isOnline) {
      this.lastOnlineTime = Date.now();
    }
  }

  // Handle online event
  private handleOnline = (): void => {
    const wasOffline = !this.isOnline;
    this.isOnline = true;
    this.lastOnlineTime = Date.now();

    // If transitioning from offline to online, emit reconnected event
    if (wasOffline) {
      this.notifyListeners('reconnected');
    }
    
    this.notifyListeners('online');
  };

  // Handle offline event
  private handleOffline = (): void => {
    this.isOnline = false;
    this.notifyListeners('offline');
  };

  // Check if currently online
  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  // Get time since last online (in milliseconds)
  public getTimeSinceLastOnline(): number | null {
    if (this.lastOnlineTime === null) {
      return null;
    }
    return Date.now() - this.lastOnlineTime;
  }

  // Actively ping a URL to verify connectivity
  public async pingForConnectivity(url: string = 'https://www.google.com'): Promise<boolean> {
    try {
      // Default to navigator.onLine
      if (navigator.onLine) {
        // We're likely online, ensure our status reflects this
        if (!this.isOnline) {
          this.handleOnline();
        }
        return true;
      }
      
      // Only do a fetch check if navigator.onLine is false
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
        // This is a CORS request that will likely fail but still tells us
        // if we have network connectivity
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      
      // If we got any response, we're online
      if (!this.isOnline) {
        this.handleOnline();
      }
      
      return true;
    } catch (error) {
      console.warn('Connectivity check failed:', error);
      
      // Only set to offline if navigator.onLine also reports offline
      if (this.isOnline && !navigator.onLine) {
        this.handleOffline();
        return false;
      }
      
      // Otherwise, trust navigator.onLine
      return navigator.onLine;
    }
  }

  // Add a listener for network status changes
  public addListener(listener: NetworkStatusListener): void {
    if (!this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }

  // Remove a listener
  public removeListener(listener: NetworkStatusListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Notify all listeners of a network status change
  private notifyListeners(event: NetworkStatusEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in network status listener:', error);
      }
    });
  }

  // Start periodic connectivity checks
  public startPeriodicChecks(intervalMs: number = 30000, url?: string): void {
    // Stop any existing checks
    this.stopPeriodicChecks();
    
    // Set up a recurring check
    this.reconnectTimeout = window.setInterval(() => {
      this.pingForConnectivity(url);
    }, intervalMs);
  }

  // Stop periodic connectivity checks
  public stopPeriodicChecks(): void {
    if (this.reconnectTimeout !== null) {
      clearInterval(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Clean up resources when no longer needed
  public cleanup(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.stopPeriodicChecks();
    this.listeners = [];
  }
}

// Convenience function to get the singleton instance
export const getNetworkStatus = (): NetworkStatusService => {
  return NetworkStatusService.getInstance();
};