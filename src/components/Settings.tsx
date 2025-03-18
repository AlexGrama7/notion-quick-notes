import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './Settings.css';

interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  url: string;
}

const Settings: React.FC = () => {
  const [apiToken, setApiToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isFetchingPages, setIsFetchingPages] = useState(false);
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedPageTitle, setSelectedPageTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // Check if user previously had dark mode enabled
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    // Apply theme when component mounts and when darkMode changes
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);
  
  useEffect(() => {
    // Force a re-render after component mount
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    // Load saved settings when component is fully mounted
    if (isLoaded) {
      loadSavedSettings();
    }
  }, [isLoaded]);
  
  const loadSavedSettings = async () => {
    try {
      const token = await invoke<string>('get_notion_api_token');
      setSavedToken(token);
      setApiToken(token);
      setIsTokenValid(!!token);
      
      const pageId = await invoke<string>('get_selected_page_id');
      setSelectedPageId(pageId);
      
      // Check if this is first time setup
      if (!token && !pageId) {
        setIsFirstTime(true);
      }
      
      if (token && pageId) {
        fetchNotionPages();
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };
  
  const verifyToken = async () => {
    clearMessages();
    
    if (!apiToken.trim()) {
      setErrorMessage('Please enter an API token');
      return;
    }
    
    try {
      const valid = await invoke<boolean>('set_notion_api_token', { apiToken });
      setIsTokenValid(valid);
      if (valid) {
        setSavedToken(apiToken);
        setSuccessMessage('API token verified successfully!');
        fetchNotionPages();
      }
    } catch (error) {
      setErrorMessage(`Error: ${error}`);
      setIsTokenValid(false);
    }
  };
  
  const fetchNotionPages = async () => {
    setIsFetchingPages(true);
    clearMessages();
    
    try {
      const pages = await invoke<NotionPage[]>('search_notion_pages');
      setNotionPages(pages);
      
      // If there's a selected page, find its title
      if (selectedPageId) {
        const selectedPage = pages.find(p => p.id === selectedPageId);
        if (selectedPage) {
          setSelectedPageTitle(selectedPage.title);
        }
      }
    } catch (error) {
      setErrorMessage(`Failed to fetch pages: ${error}`);
    } finally {
      setIsFetchingPages(false);
    }
  };
  
  const saveSelectedPage = async () => {
    if (!selectedPageId) {
      setErrorMessage('Please select a page');
      return;
    }
    
    clearMessages();
    
    try {
      // Get the title of the selected page
      const selectedPage = notionPages.find(p => p.id === selectedPageId);
      if (!selectedPage) {
        setErrorMessage('Invalid page selection');
        return;
      }
      
      await invoke('set_selected_page_id', { 
        pageId: selectedPageId,
        pageTitle: selectedPage.title
      });
      
      setSelectedPageTitle(selectedPage.title);
      setSuccessMessage('Selected page saved successfully!');
    } catch (error) {
      setErrorMessage(`Failed to save selected page: ${error}`);
    }
  };
  
  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };
  
  return (
    <div className="settings-container">
      <div className="settings-header">
        <div className="header-left">
          <button 
            className="back-button"
            onClick={async () => {
              try {
                // First close the settings window
                await invoke('close_settings');
                // Then show the note input window
                await invoke('show_note_input');
              } catch (error) {
                console.error('Error navigating back:', error);
              }
            }}
            title="Back to Notes"
          >
            ←
          </button>
          <h1>Settings</h1>
        </div>
        <div className="theme-toggle">
          <button 
            className="theme-toggle-button" 
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
      
      {isFirstTime && (
        <div className="first-time-setup">
          <h3>Welcome to Notion Quick Notes!</h3>
          <p>To get started, you need to:</p>
          <ol>
            <li>Create a Notion integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">notion.so/my-integrations</a></li>
            <li>Copy your integration token and paste it below</li>
            <li>Verify the token and select a page where your notes will be saved</li>
            <li>Share your selected Notion page with your integration</li>
          </ol>
          <p>Need help? Click "About" in the system tray menu for detailed instructions.</p>
        </div>
      )}
      
      <div className="settings-section">
        <h2>Notion API Integration</h2>
        <p className="settings-description">
          You need a Notion API token to connect to your Notion workspace.
          <a 
            href="https://developers.notion.com/docs/getting-started" 
            target="_blank" 
            rel="noreferrer"
            className="settings-link"
          >
            Learn how to get your API token
          </a>
        </p>
        
        <div className="input-group">
          <label htmlFor="apiToken">Notion API Token:</label>
          <input
            type="password"
            id="apiToken"
            className="settings-input"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="secret_..."
          />
          <button 
            className="verify-button"
            onClick={verifyToken}
            disabled={!apiToken || apiToken === savedToken}
          >
            Verify Token
          </button>
        </div>
        
        {isTokenValid && (
          <div className="page-selection-section">
            <h2>Select Default Notion Page</h2>
            <p className="settings-description">
              Select the page where your quick notes will be appended.
            </p>
            
            <button 
              className="fetch-button"
              onClick={fetchNotionPages}
              disabled={isFetchingPages}
            >
              {isFetchingPages ? 'Fetching...' : 'Fetch Pages'}
            </button>
            
            {notionPages.length > 0 && (
              <>
                <div className="select-container">
                  <label htmlFor="notionPage">Select Page:</label>
                  <select
                    id="notionPage"
                    className="page-select"
                    value={selectedPageId}
                    onChange={(e) => setSelectedPageId(e.target.value)}
                  >
                    <option value="">-- Select a page --</option>
                    {notionPages.map(page => (
                      <option key={page.id} value={page.id}>
                        {page.icon ? `${page.icon} ` : ''}{page.title}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button 
                  className="save-button"
                  onClick={saveSelectedPage}
                  disabled={!selectedPageId}
                >
                  Save Selected Page
                </button>
              </>
            )}
            
            {selectedPageTitle && (
              <div className="selected-page">
                <p>Current page: <strong>{selectedPageTitle}</strong></p>
              </div>
            )}
          </div>
        )}
        
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
        
        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}
      </div>
      
      <div className="settings-footer">
        <p>
          Notion Quick Notes - v0.1.0
        </p>
      </div>
    </div>
  );
};

export default Settings;