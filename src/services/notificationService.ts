// Notification Service for Notion Quick Notes
// Provides cross-platform notification capabilities

// Types of notifications the app can show
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

// Desktop notification options
interface DesktopNotificationOptions {
  title: string;
  body: string;
  type: NotificationType;
  requireInteraction?: boolean; // Should notification persist until user interacts with it
  onClick?: () => void;
  onClose?: () => void;
  autoClose?: number; // Time in ms before auto-closing (0 means no auto-close)
}

// Notification history item for persistence
export interface NotificationHistoryItem {
  id: string;
  timestamp: number; // Unix timestamp
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  related?: {
    noteId?: string;
    pageId?: string;
  };
}

// Class to handle desktop and in-app notifications
export class NotificationService {
  private static instance: NotificationService;
  private history: NotificationHistoryItem[] = [];
  private listeners: ((history: NotificationHistoryItem[]) => void)[] = [];
  private hasPermission: boolean = false;
  private permissionRequested: boolean = false;

  // Get the singleton instance
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Private constructor to enforce singleton pattern
  private constructor() {
    this.initialize();
  }

  // Initialize notification system
  private async initialize(): Promise<void> {
    // Check if we have permission for desktop notifications
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        this.hasPermission = true;
      }
    }

    // Load notification history from local storage
    this.loadHistory();

    // Set up cleanup interval to remove old notifications (older than 30 days)
    setInterval(() => this.cleanupOldNotifications(), 24 * 60 * 60 * 1000); // Daily cleanup
  }

  // Request notification permission from user
  public async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("This browser does not support desktop notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      this.hasPermission = true;
      return true;
    }

    if (Notification.permission !== "denied" && !this.permissionRequested) {
      this.permissionRequested = true;
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === "granted";
      return this.hasPermission;
    }

    return this.hasPermission;
  }

  // Show a desktop notification
  public async showDesktopNotification(options: DesktopNotificationOptions): Promise<string | null> {
    // Generate unique ID for this notification
    const notificationId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    // Record in history first (even if desktop notification fails, we have it in-app)
    const historyItem: NotificationHistoryItem = {
      id: notificationId,
      timestamp: Date.now(),
      type: options.type,
      title: options.title,
      body: options.body,
      read: false
    };
    
    this.addToHistory(historyItem);

    // If no desktop notification support or permission, just return the ID
    if (!("Notification" in window) || !this.hasPermission) {
      console.log(`Desktop notification not shown (no permission): ${options.title}`);
      return notificationId;
    }

    try {
      // Show desktop notification
      const notification = new Notification(options.title, {
        body: options.body,
        requireInteraction: options.requireInteraction || false,
        icon: '/tauri.svg' // Default icon path
      });

      // Set up event handlers
      if (options.onClick) {
        notification.onclick = () => {
          options.onClick?.();
          this.markAsRead(notificationId);
        };
      }

      if (options.onClose) {
        notification.onclose = options.onClose;
      }

      // Auto-close if specified
      if (options.autoClose && options.autoClose > 0) {
        setTimeout(() => notification.close(), options.autoClose);
      }

      return notificationId;
    } catch (error) {
      console.error("Failed to show desktop notification:", error);
      return notificationId; // Still return the ID since we recorded it in history
    }
  }

  // Show a critical notification that absolutely requires user acknowledgment
  public async showCriticalNotification(title: string, body: string): Promise<string> {
    // First try desktop notification with requireInteraction
    const notificationId = await this.showDesktopNotification({
      title,
      body,
      type: 'error',
      requireInteraction: true
    }) || Date.now().toString(36);

    // Also trigger any additional critical notifications (sound, etc)
    try {
      // Play a notification sound if available
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.log('Could not play notification sound:', e));
    } catch (error) {
      console.warn("Could not play notification sound:", error);
    }

    return notificationId;
  }

  // Notify of successful note sync
  public async notifyNoteSuccess(pageTitle: string, notePreview: string, noteId?: string, pageId?: string): Promise<string> {
    const title = "Note Successfully Sent";
    const body = `Your note has been successfully added to "${pageTitle}"\n\n${this.truncateText(notePreview, 50)}`;
    
    const notificationId = await this.showDesktopNotification({
      title,
      body,
      type: 'success',
      requireInteraction: true,
      autoClose: 10000 // 10 seconds
    }) || Date.now().toString(36);

    // If we have note/page IDs, add them to the notification
    if (notificationId && (noteId || pageId)) {
      const notification = this.history.find(item => item.id === notificationId);
      if (notification) {
        notification.related = {
          noteId,
          pageId
        };
        this.saveHistory();
        this.notifyListeners();
      }
    }

    return notificationId;
  }

  // Get notification history
  public getHistory(): NotificationHistoryItem[] {
    return [...this.history];
  }

  // Mark a notification as read
  public markAsRead(id: string): void {
    const notification = this.history.find(item => item.id === id);
    if (notification) {
      notification.read = true;
      this.saveHistory();
      this.notifyListeners();
    }
  }

  // Mark all notifications as read
  public markAllAsRead(): void {
    this.history.forEach(item => item.read = true);
    this.saveHistory();
    this.notifyListeners();
  }

  // Clear notification history
  public clearHistory(): void {
    this.history = [];
    this.saveHistory();
    this.notifyListeners();
  }

  // Get unread notification count
  public getUnreadCount(): number {
    return this.history.filter(item => !item.read).length;
  }

  // Add history item
  private addToHistory(item: NotificationHistoryItem): void {
    this.history.unshift(item); // Add to beginning of array
    this.saveHistory();
    this.notifyListeners();
  }

  // Load notification history from storage
  private loadHistory(): void {
    try {
      const saved = localStorage.getItem('notification_history');
      if (saved) {
        this.history = JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load notification history:", error);
      this.history = [];
    }
  }

  // Save notification history to storage
  private saveHistory(): void {
    try {
      // Limit history to most recent 100 items
      if (this.history.length > 100) {
        this.history = this.history.slice(0, 100);
      }
      localStorage.setItem('notification_history', JSON.stringify(this.history));
    } catch (error) {
      console.error("Failed to save notification history:", error);
    }
  }

  // Clean up old notifications (older than 30 days)
  private cleanupOldNotifications(): void {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const originalLength = this.history.length;
    
    this.history = this.history.filter(item => item.timestamp >= thirtyDaysAgo);
    
    if (this.history.length !== originalLength) {
      this.saveHistory();
      this.notifyListeners();
    }
  }

  // Add a listener for history changes
  public addListener(listener: (history: NotificationHistoryItem[]) => void): void {
    if (!this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }

  // Remove a listener
  public removeListener(listener: (history: NotificationHistoryItem[]) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Notify all listeners of history changes
  private notifyListeners(): void {
    const history = this.getHistory();
    this.listeners.forEach(listener => {
      try {
        listener(history);
      } catch (error) {
        console.error("Error in notification listener:", error);
      }
    });
  }

  // Helper function to truncate text
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
  }
}

// Convenience function to get the singleton instance
export const getNotificationService = (): NotificationService => {
  return NotificationService.getInstance();
};