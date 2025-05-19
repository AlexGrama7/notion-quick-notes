import { useEffect, useState } from 'react';
import { addAIEventListener, AI_EVENTS, ModelType } from '../services/ai';
import './AIModelFallbackNotification.css';

interface ModelSwitchEvent {
  from: ModelType;
  to: ModelType;
  reason: string;
}

const AIModelFallbackNotification: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [switchDetails, setSwitchDetails] = useState<ModelSwitchEvent | null>(null);

  useEffect(() => {
    // Listen for model switch events
    const removeListener = addAIEventListener(
      AI_EVENTS.MODEL_SWITCH,
      (event: CustomEvent) => {
        const details = event.detail as ModelSwitchEvent;
        
        // Only show notification for fallbacks, not for explicit user switches
        if (details.reason === 'fallback') {
          setSwitchDetails(details);
          setVisible(true);
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setVisible(false);
          }, 5000);
        }
      }
    );

    return () => {
      removeListener();
    };
  }, []);

  // Don't render if not visible or no switch details
  if (!visible || !switchDetails) {
    return null;
  }

  // Format model names for display
  const formatModelName = (model: ModelType) => {
    switch (model) {
      case ModelType.GPT4o:
        return 'GPT-4o';
      case ModelType.GPT4oMini:
        return 'GPT-4o Mini';
      default:
        return model;
    }
  };

  const handleClose = () => {
    setVisible(false);
  };

  return (
    <div className="ai-fallback-notification">
      <div className="fallback-content">
        <div className="fallback-icon">ℹ️</div>
        <div className="fallback-message">
          <p>
            <strong>AI Model Switch:</strong> Switched from {formatModelName(switchDetails.from)} to{' '}
            {formatModelName(switchDetails.to)} for better performance.
          </p>
          <p className="fallback-submessage">
            This helps maintain responsiveness when the primary model is busy.
          </p>
        </div>
      </div>
      <button className="fallback-close" onClick={handleClose}>
        ✕
      </button>
    </div>
  );
};

export default AIModelFallbackNotification;