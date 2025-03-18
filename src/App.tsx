import { useState, useEffect, useMemo, useCallback, memo } from "react";
import "./App.css";
import NoteInput from "./components/NoteInput";
import Settings from "./components/Settings";
import About from "./components/About";

const App: React.FC = () => {
  const [view, setView] = useState<"note" | "settings" | "about">("note");
  
  // Memoize the URL parameter checking function
  const checkWindow = useCallback(() => {
    console.log("Checking which window to display");
    const url = window.location.href;
    
    const queryParams = new URLSearchParams(window.location.search);
    const settingsParam = queryParams.get("settings");
    const aboutParam = queryParams.get("about");
    
    // Check window title as a fallback method
    const windowTitle = document.title;
    
    if (settingsParam === "true" || url.includes("settings=true") || windowTitle.includes("Settings")) {
      setView("settings");
      document.title = "Notion Quick Notes - Settings";
      document.body.setAttribute('data-window', 'settings');
    } else if (aboutParam === "true" || url.includes("about=true") || windowTitle.includes("About")) {
      setView("about");
      document.title = "Notion Quick Notes - About";
      document.body.setAttribute('data-window', 'about');
    } else {
      setView("note");
      document.title = "Notion Quick Notes";
      document.body.setAttribute('data-window', 'main');
    }
  }, []);

  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    
    // Initial view check
    checkWindow();
    
    // Also check window params when URL changes
    window.addEventListener('popstate', checkWindow);
    
    return () => {
      window.removeEventListener('popstate', checkWindow);
    };
  }, [checkWindow]);

  // Apply different container classes based on the view
  const containerClass = `app-container ${view === "settings" ? "settings-view" : ""}`;

  // Memoize component selection to prevent unnecessary recreation
  const CurrentView = useMemo(() => {
    switch(view) {
      case "note":
        return <NoteInput />;
      case "settings":
        return <Settings />;
      case "about":
        return <About />;
    }
  }, [view]);

  return (
    <div className={containerClass}>
      {CurrentView}
    </div>
  );
}

export default memo(App);
