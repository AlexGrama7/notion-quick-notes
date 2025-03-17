import { useState, useEffect } from "react";
import "./App.css";
import NoteInput from "./components/NoteInput";
import Settings from "./components/Settings";

function App() {
  const [view, setView] = useState<"note" | "settings">("note");
  
  useEffect(() => {
    // Check which window we're in by looking at URL params or document title
    const checkWindow = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("settings") === "true" || document.title.includes("Settings")) {
        setView("settings");
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
      ) : (
        <Settings />
      )}
    </div>
  );
}

export default App;
