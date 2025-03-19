import { useState, useEffect, useRef } from 'react';
import { NotificationHistoryItem, getNotificationService } from '../services/notificationService';
import './NotificationIndicator.css';

interface NotificationIndicatorProps {
  size?: number;
  className?: string;
  position?: 'left' | 'right';
}

const NotificationIndicator: React.FC<NotificationIndicatorProps> = ({
  size = 24,
  className = '',
  position = 'right'
}) => {
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationService = getNotificationService();

  // Initial setup and event listeners
  useEffect(() => {
    // Request notification permissions on component mount
    const requestPermission = async () => {
      try {
        await notificationService.requestPermission();
      } catch (error) {
        console.warn('Failed to request notification permission:', error);
      }
    };
    
    requestPermission();
    
    // Load initial notifications
    const initialNotifications = notificationService.getHistory();
    setNotifications(initialNotifications);
    setUnreadCount(notificationService.getUnreadCount());
    
    // Set up notification history listener
    const historyListener = (history: NotificationHistoryItem[]) => {
      setNotifications(history);
      setUnreadCount(notificationService.getUnreadCount());
    };
    
    notificationService.addListener(historyListener);
    
    // Add click outside listener to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup
    return () => {
      notificationService.removeListener(historyListener);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Toggle dropdown visibility
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };
  
  // Mark a specific notification as read
  const markAsRead = (id: string) => {
    notificationService.markAsRead(id);
  };
  
  // Mark all notifications as read
  const markAllAsRead = () => {
    notificationService.markAllAsRead();
  };
  
  // Clear notification history
  const clearHistory = () => {
    notificationService.clearHistory();
  };
  
  // Format time as relative (e.g., "5m ago")
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    // Less than a minute
    if (diff < 60 * 1000) {
      return 'just now';
    }
    
    // Less than an hour
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}m ago`;
    }
    
    // Less than a day
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}h ago`;
    }
    
    // More than a day
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  };
  
  return (
    <div
      className={`notification-indicator ${className}`}
      style={{ fontSize: size }}
      ref={dropdownRef}
    >
      <div onClick={toggleDropdown} role="button" aria-label="Notifications">
        <span className="notification-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
      
      {isOpen && (
        <div className="notification-dropdown" style={{ [position]: 0 }}>
          <div className="notification-header">
            <div className="notification-title">Notifications</div>
            <div className="notification-actions">
              <button 
                className="notification-action-button" 
                onClick={markAllAsRead}
                title="Mark all as read"
              >
                Mark all read
              </button>
              <button 
                className="notification-action-button" 
                onClick={clearHistory}
                title="Clear history"
              >
                Clear all
              </button>
            </div>
          </div>
          
          {notifications.length > 0 ? (
            <ul className="notifications-content">
              {notifications.map((notification) => (
                <li 
                  key={notification.id} 
                  className={`notification-item ${notification.read ? '' : 'unread'}`}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <div className="notification-item-header">
                    <div className={`notification-item-type ${notification.type}`}>
                      {notification.type === 'success' && '✓ '}
                      {notification.type === 'error' && '✕ '}
                      {notification.type === 'warning' && '⚠ '}
                      {notification.type === 'info' && 'ℹ '}
                      {notification.title}
                    </div>
                    <div className="notification-item-time">
                      {formatRelativeTime(notification.timestamp)}
                    </div>
                  </div>
                  <p className="notification-item-body">{notification.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-notifications">
              <div className="empty-notifications-icon">🔔</div>
              <div className="empty-notifications-text">
                No notifications yet
              </div>
            </div>
          )}
          
          <div className="notification-footer">
            <button className="view-all-button">
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationIndicator;