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
    
    // Check which window we're in by looking at URL params or document title
    const checkWindow = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("settings") === "true" || document.title.includes("Settings")) {
        setView("settings");
      } else if (params.get("about") === "true" || document.title.includes("About")) {
        setView("about");
      } else {
        setView("note");
      }
    };
    
    checkWindow();
  }, []);

  return (
    <div className="app-container">
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
