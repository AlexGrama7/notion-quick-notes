import { useState, useEffect } from 'react';
import {
  loadAISettings,
  updateAISettings,
  ModelType,
  AIServiceSettings,
  getAIState,
  addAIEventListener,
  AI_EVENTS
} from '../services/ai';
import './AISettings.css';

const AISettings: React.FC = () => {
  const [settings, setSettings] = useState<AIServiceSettings>(loadAISettings());
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [testStatus, setTestStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ status: 'idle' });
  const [aiState, setAiState] = useState(getAIState());

  // Update local state when settings change elsewhere
  useEffect(() => {
    const removeListener = addAIEventListener(AI_EVENTS.CONFIG_CHANGE, (event: CustomEvent) => {
      setSettings(event.detail.settings);
    });

    // Update AI state periodically
    const stateInterval = setInterval(() => {
      setAiState(getAIState());
    }, 5000);

    return () => {
      removeListener();
      clearInterval(stateInterval);
    };
  }, []);

  // Handle API key change
  const handleApiKeyChange = (value: string) => {
    const updatedSettings = {
      ...settings,
      primaryModel: {
        ...settings.primaryModel,
        apiKey: value
      }
    };
    setSettings(updatedSettings);
    
    // Auto-save API key when changed to prevent "not configured" errors
    updateAISettings(updatedSettings);
  };

  // Handle model selection
  const handleModelChange = (modelType: 'primary' | 'fallback', value: ModelType) => {
    const updatedSettings = {
      ...settings,
      [modelType === 'primary' ? 'primaryModel' : 'fallbackModel']: {
        ...settings[modelType === 'primary' ? 'primaryModel' : 'fallbackModel'],
        modelName: value
      }
    };
    setSettings(updatedSettings);
  };

  // Fallback strategy handlers removed as the section is no longer needed

  // Telemetry functionality removed per UI requirements

  // Save settings
  const handleSave = () => {
    updateAISettings(settings);
  };

  // Test API key
  const handleTestConnection = async () => {
    setTestStatus({ status: 'loading' });
    try {
      const { sendPrompt } = await import('../services/ai');
      const response = await sendPrompt('Hello, please respond with "API connection successful"');
      
      setTestStatus({ 
        status: 'success', 
        message: `Connected to ${response.modelUsed} (${response.processingTime}ms)`
      });
    } catch (error: any) {
      setTestStatus({
        status: 'error',
        message: error.message || 'Failed to connect to AI service'
      });
    }
  };

  return (
    <div className="ai-settings-container">
      
      <div className="settings-section">
        <h3>OpenAI API Configuration</h3>
        <div className="setting-group">
          <label>API Key:</label>
          <div className="api-key-input">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={settings.primaryModel.apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Enter your OpenAI API key"
            />
            <button 
              type="button" 
              className="toggle-visibility" 
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
            >
              {apiKeyVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="api-key-actions">
            <button 
              onClick={handleTestConnection}
              disabled={!settings.primaryModel.apiKey || testStatus.status === 'loading'}
              className="test-connection-button"
            >
              {testStatus.status === 'loading' ? 'Testing...' : 'Test Connection'}
            </button>
            {testStatus.status !== 'idle' && (
              <span className={`test-status test-${testStatus.status}`}>
                {testStatus.message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Model Selection</h3>
        <div className="setting-group">
          <label>Primary Model:</label>
          <select
            value={settings.primaryModel.modelName}
            onChange={(e) => handleModelChange('primary', e.target.value as ModelType)}
          >
            <option value={ModelType.GPT4o}>GPT-4o (Recommended)</option>
            <option value={ModelType.GPT4oMini}>GPT-4o Mini (Faster)</option>
          </select>
        </div>

        <div className="setting-group">
          <label>Fallback Model:</label>
          <select
            value={settings.fallbackModel.modelName}
            onChange={(e) => handleModelChange('fallback', e.target.value as ModelType)}
            disabled={!settings.fallbackStrategy.enabled}
          >
            <option value={ModelType.GPT4oMini}>GPT-4o Mini (Recommended)</option>
            <option value={ModelType.GPT4o}>GPT-4o</option>
          </select>
        </div>
      </div>

      {/* Fallback Strategy section removed as requested */}

      {aiState.totalRequests > 0 && (
        <div className="settings-section">
          <h3>AI Usage Statistics</h3>
          <div className="stats-container">
            <div className="stat-item">
              <span className="stat-label">Total Requests:</span>
              <span className="stat-value">{aiState.totalRequests}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Success Rate:</span>
              <span className="stat-value">
                {Math.round(((aiState.totalRequests - aiState.failedRequests) / aiState.totalRequests) * 100)}%
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Current Model:</span>
              <span className="stat-value">{aiState.activeModel}</span>
            </div>
          </div>
        </div>
      )}

      <div className="settings-actions">
        <button onClick={handleSave} className="save-button">
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default AISettings;