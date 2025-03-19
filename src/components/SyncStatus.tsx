import React, { useState, useEffect } from 'react';
import { getQueuedNoteCount } from '../services/offlineQueue';
import { getSyncService, SyncStatusEvent } from '../services/syncService';
import { getNetworkStatus } from '../services/networkStatus';
import './SyncStatus.css';

interface SyncStatusProps {
  // Optional class name for styling
  className?: string;
}

const SyncStatus: React.FC<SyncStatusProps> = ({ className }) => {
  // State for tracking sync status
  const [status, setStatus] = useState<SyncStatusEvent>('idle');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncDetails, setSyncDetails] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  // Update queue count periodically
  useEffect(() => {
    const updateQueueCount = async () => {
      const count = await getQueuedNoteCount('pending');
      setQueueCount(count);
    };

    // Initial update
    updateQueueCount();

    // Set up interval for updates
    const intervalId = setInterval(updateQueueCount, 5000);

    return () => clearInterval(intervalId);
  }, []);

  // Listen for sync and network status changes
  useEffect(() => {
    const syncService = getSyncService();
    const networkStatus = getNetworkStatus();

    // Handle sync status changes
    const syncStatusListener = (newStatus: SyncStatusEvent, details?: any) => {
      setStatus(newStatus);
      setSyncDetails(details);
      
      // Update last sync time if completed
      if (newStatus === 'completed') {
        setLastSyncTime(Date.now());
      }
      
      // Re-check queue count after sync
      getQueuedNoteCount('pending').then(setQueueCount);
    };

    // Handle network status changes
    const networkStatusListener = () => {
      setIsOnline(networkStatus.isNetworkOnline());
    };

    // Add listeners
    syncService.addListener(syncStatusListener);
    networkStatus.addListener(networkStatusListener);
    
    // Initial status
    setIsOnline(networkStatus.isNetworkOnline());
    setLastSyncTime(syncService.getLastSyncTime());

    // Cleanup listeners on unmount
    return () => {
      syncService.removeListener(syncStatusListener);
      networkStatus.removeListener(networkStatusListener);
    };
  }, []);

  // Format timestamp as relative time
  const formatTime = (timestamp: number | null): string => {
    if (timestamp === null) {
      return 'Never';
    }

    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) {
      return 'Just now';
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffSec / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  };

  // Handle manual sync button click
  const handleSyncNow = () => {
    const syncService = getSyncService();
    syncService.syncNow();
  };

  // Get appropriate message based on status
  const getStatusMessage = (): string => {
    if (!isOnline) {
      return 'Offline';
    }

    switch (status) {
      case 'syncing':
        return 'Syncing...';
      case 'completed':
        return `Last synced: ${formatTime(lastSyncTime)}`;
      case 'failed':
        return 'Sync failed';
      default:
        return queueCount > 0 
          ? `${queueCount} note${queueCount !== 1 ? 's' : ''} pending sync` 
          : 'All notes synced';
    }
  };

  // Determine the status icon
  const getStatusIcon = (): string => {
    if (!isOnline) {
      return '🔴'; // Red circle for offline
    }

    switch (status) {
      case 'syncing':
        return '🔄'; // Sync in progress
      case 'completed':
        return '✅'; // Green checkmark for completed
      case 'failed':
        return '⚠️'; // Warning for failed
      default:
        return queueCount > 0 ? '⏱️' : '✓'; // Clock for pending, checkmark for synced
    }
  };

  // Only show sync button if there are notes to sync and we're online
  const showSyncButton = queueCount > 0 && isOnline && status !== 'syncing';

  return (
    <div className={`sync-status ${className || ''} ${status}`}>
      <div className="sync-status-icon">{getStatusIcon()}</div>
      <div className="sync-status-message">{getStatusMessage()}</div>
      
      {showSyncButton && (
        <button 
          className="sync-now-button"
          onClick={handleSyncNow}
          title="Sync now"
        >
          Sync Now
        </button>
      )}
    </div>
  );
};

export default SyncStatus;