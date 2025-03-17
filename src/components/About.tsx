import React, { useState, useEffect } from 'react';
import './About.css';

const About: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => {
    // Check if user previously had dark mode enabled
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });
  
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
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className="about-container">
      <div className="about-header">
        <h1 className="about-title">About Notion Quick Notes</h1>
        <button 
          className="dark-mode-toggle" 
          onClick={toggleDarkMode}
          title="Toggle Dark Mode"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>
      
      <div className="about-section">
        <h2>Overview</h2>
        <p>
          Notion Quick Notes is a lightweight desktop application that lets you quickly capture thoughts, ideas, or notes and send them directly to a selected Notion page.
        </p>
      </div>
      
      <div className="about-section">
        <h2>Features</h2>
        <ul className="feature-list">
          <li><strong>Global Hotkey:</strong> Press Alt+Q anywhere to quickly open the note input window</li>
          <li><strong>Minimalist Interface:</strong> Distraction-free note-taking experience</li>
          <li><strong>Notion Integration:</strong> Seamless integration with your Notion workspace</li>
          <li><strong>Automatic Timestamps:</strong> Each note is automatically timestamped</li>
          <li><strong>System Tray:</strong> Access from the system tray at any time</li>
        </ul>
      </div>
      
      <div className="about-section">
        <h2>Setup Guide</h2>
        <ol className="setup-steps">
          <li>
            <strong>Get a Notion API Token:</strong>
            <p>Visit the <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">Notion Integrations page</a> to create a new integration and get your API token.</p>
          </li>
          <li>
            <strong>Configure the App:</strong>
            <p>Open the Settings page from the system tray, enter your API token, and verify it.</p>
          </li>
          <li>
            <strong>Select a Notion Page:</strong>
            <p>Fetch available pages and select the one where you want your quick notes to be added.</p>
          </li>
          <li>
            <strong>Share Your Notion Page:</strong>
            <p>In Notion, you need to share the page with your integration. Click "Share" on your page, then find your integration in the dropdown and share it.</p>
          </li>
        </ol>
      </div>
      
      <div className="about-section">
        <h2>Usage Tips</h2>
        <ul className="usage-tips">
          <li>Use <strong>Ctrl+Enter</strong> to quickly save a note</li>
          <li>Press <strong>Esc</strong> to cancel and close the note window</li>
          <li>Notes are appended to your selected Notion page with a timestamp</li>
          <li>The application runs in the background for quick access anytime</li>
        </ul>
      </div>
      
      <div className="about-footer">
        <p>
          Notion Quick Notes - v0.1.0
        </p>
        <p>
          <a href="https://github.com/AlexGrama7/notion-quick-notes" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
};

export default About; 