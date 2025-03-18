import { useState, useEffect } from "react";
import "./App.css";
import NoteInput from "./components/NoteInput";
import Settings from "./components/Settings";
import About from "./components/About";

function App() {
  const [view, setView] = useState<"note" | "settings" | "about">("note");
  
  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    
    // Determine which view to show based on URL parameters
    const checkWindow = () => {
      console.log("Checking which window to display");
      const url = window.location.href;
      console.log("Current URL:", url);
      
      const queryParams = new URLSearchParams(window.location.search);
      const settingsParam = queryParams.get("settings");
      const aboutParam = queryParams.get("about");
      
      console.log("URL params - settings:", settingsParam, "about:", aboutParam);
      
      // Check window title as a fallback method
      const windowTitle = document.title;
      console.log("Window title:", windowTitle);
      
      if (settingsParam === "true" || url.includes("settings=true") || windowTitle.includes("Settings")) {
        console.log("Switching to settings view");
        setView("settings");
        document.title = "Notion Quick Notes - Settings";
        document.body.setAttribute('data-window', 'settings');
      } else if (aboutParam === "true" || url.includes("about=true") || windowTitle.includes("About")) {
        console.log("Switching to about view");
        setView("about");
        document.title = "Notion Quick Notes - About";
        document.body.setAttribute('data-window', 'about');
      } else {
        console.log("Switching to note input view");
        setView("note");
        document.title = "Notion Quick Notes";
        document.body.setAttribute('data-window', 'main');
      }
    };
    
    checkWindow();
    
    // Also check window params when URL changes
    window.addEventListener('popstate', checkWindow);
    
    return () => {
      window.removeEventListener('popstate', checkWindow);
    };
  }, []);

  // Apply different container classes based on the view
  const containerClass = `app-container ${view === "settings" ? "settings-view" : ""}`;

  return (
    <div className={containerClass}>
      {view === "note" ? (
        <NoteInput />
      ) : view === "settings" ? (
        <Settings />
      ) : (
        <About />
      )}
    </div>
  );
}

export default App;
