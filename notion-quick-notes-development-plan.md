# Notion Quick Notes - Development Plan

## Overview

Notion Quick Notes is a lightweight Windows desktop application designed for rapid note capture with minimal resource usage. The application operates silently in the background, allowing users to quickly capture notes using a global hotkey (ALT+Q) and append them, along with a timestamp, to a selected Notion page.

## Technology Stack

After evaluating several options, we've chosen the following technology stack:

1. **Frontend**: React + TypeScript
   - Provides a modern, component-based UI that is fast and responsive
   - TypeScript adds type safety and improves code quality
   - Small bundle size for a lightweight application

2. **Backend**: Tauri Framework
   - Combines Rust (for core system operations) with web technologies (React)
   - Significantly smaller application size compared to Electron (2-3MB vs 100+MB)
   - Lower resource usage than Electron
   - Native system integration for global hotkeys
   - System tray functionality

3. **API Integration**: Notion API
   - REST API for interacting with Notion databases and pages
   - Authentication via API token
   - Append Block Children operation for adding notes to pages

## Architecture

The application follows a modular architecture with clear separation of concerns:

### Core Components

1. **Main Process (Rust)**
   - Global hotkey registration (ALT+Q)
   - System tray integration
   - Window management
   - Notion API client
   - Configuration management

2. **UI Layer (React + TypeScript)**
   - Note input component
   - Settings panel
   - Notion page selection dropdown

3. **Data Flow**
   - User triggers ALT+Q → Note input window appears
   - User enters note → Note is sent to Rust backend
   - Rust backend formats note with timestamp → Sends to Notion API
   - Response is handled and displayed to user

### File Structure

```
notion-quick-notes/
├── src/                     # Frontend code (React)
│   ├── components/         
│   │   ├── NoteInput.tsx    # Quick note input component
│   │   └── Settings.tsx     # Settings panel component
│   ├── App.tsx              # Main React component
│   └── main.tsx             # Entry point
├── src-tauri/               # Backend code (Rust)
│   ├── src/
│   │   ├── config.rs        # Configuration management
│   │   ├── notion.rs        # Notion API client
│   │   ├── error.rs         # Error handling
│   │   ├── lib.rs           # Core functionality
│   │   └── main.rs          # Entry point
│   └── Cargo.toml           # Rust dependencies
└── package.json             # Node dependencies
```

## Key Features Implementation

### 1. Global Hotkey (ALT+Q)

The global hotkey system leverages Tauri's global shortcut API to register a system-wide keyboard shortcut:

```rust
// Register the global hotkey
pub fn register_global_hotkey(app_handle: AppHandle) {
    let app_handle_clone = app.clone();
    
    app_handle.global_shortcut().register("Alt+Q", move || {
        show_note_input(app_handle_clone.clone());
    })
    .unwrap_or_else(|e| {
        eprintln!("Failed to register global hotkey: {}", e);
    });
}
```

### 2. Note Capture UI

The note input UI is a minimalist React component that appears when ALT+Q is pressed. It focuses on speed and simplicity:

```tsx
function NoteInput() {
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    // Auto-focus the textarea when component mounts
    textareaRef.current?.focus();
  }, []);
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    
    try {
      await invoke('append_note', { noteText: note });
      setNote('');
      // Hide the window after successful submission
      await invoke('close_note_input');
    } catch (error) {
      console.error('Failed to append note:', error);
      // Show error to user
    }
  };
  
  return (
    <div className="note-input-container">
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type your note here..."
          className="note-textarea"
        />
        <div className="actions">
          <button type="submit">Save to Notion</button>
          <button type="button" onClick={() => invoke('close_note_input')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

### 3. Notion Integration

The Notion API client is implemented in Rust to handle authentication, page search, and note appending:

```rust
// Append a note to the selected Notion page
pub async fn append_note_to_page(
    &self, 
    page_id: &str, 
    note_text: &str
) -> Result<(), Box<dyn Error>> {
    // Generate timestamp in format [DD MMM YY, HH:MM:SS]
    let now = Local::now();
    let timestamp = format!(
        "[{:02} {} {:02}, {:02}:{:02}:{:02}]",
        now.day(),
        match now.month() {
            1 => "Jan", 2 => "Feb", 3 => "Mar", 4 => "Apr", 5 => "May", 6 => "Jun",
            7 => "Jul", 8 => "Aug", 9 => "Sep", 10 => "Oct", 11 => "Nov", 12 => "Dec",
            _ => "Unknown",
        },
        now.year() % 100,
        now.hour(),
        now.minute(),
        now.second()
    );
    
    // Structure the request body for appending a block to the page
    let append_body = json!({
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": format!("{} {}", timestamp, note_text)
                            },
                            "annotations": {
                                "bold": true,
                                "color": "default"
                            }
                        }
                    ]
                }
            }
        ]
    });
    
    // Send API request
    let res = self.client
        .patch(&format!("https://api.notion.com/v1/blocks/{}/children", page_id))
        .json(&append_body)
        .send()
        .await?;
        
    // Handle response
    if !res.status().is_success() {
        let error_body: serde_json::Value = res.json().await?;
        return Err(format!(
            "API error: {} - {}", 
            res.status(), 
            error_body["message"].as_str().unwrap_or("Unknown error")
        ).into());
    }
    
    Ok(())
}
```

### 4. Settings UI

The settings panel allows users to configure their Notion API token and select a target page:

```tsx
function Settings() {
  const [apiToken, setApiToken] = useState('');
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Load saved API token and selected page on component mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const savedToken = await invoke('get_notion_api_token');
        setApiToken(savedToken as string);
        
        const savedPageId = await invoke('get_selected_page_id');
        setSelectedPage(savedPageId as string);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    
    loadSettings();
  }, []);
  
  // Fetch Notion pages when API token is verified
  const fetchPages = async () => {
    setIsLoading(true);
    try {
      const pages = await invoke('search_notion_pages') as NotionPage[];
      setPages(pages);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      setIsLoading(false);
    }
  };
  
  // Save API token
  const saveApiToken = async () => {
    try {
      const isValid = await invoke('set_notion_api_token', { apiToken });
      if (isValid) {
        fetchPages();
      }
    } catch (error) {
      console.error('Failed to save API token:', error);
    }
  };
  
  // Save selected page
  const saveSelectedPage = async (pageId: string, pageTitle: string) => {
    try {
      await invoke('set_selected_page_id', { pageId, pageTitle });
      setSelectedPage(pageId);
    } catch (error) {
      console.error('Failed to save selected page:', error);
    }
  };
  
  return (
    <div className="settings-container">
      <h2>Notion Quick Notes Settings</h2>
      
      <div className="setting-group">
        <h3>Notion API Token</h3>
        <input
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="Enter your Notion API token"
        />
        <button onClick={saveApiToken}>Verify & Save</button>
      </div>
      
      <div className="setting-group">
        <h3>Select Notion Page</h3>
        <button onClick={fetchPages} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Fetch Pages'}
        </button>
        
        <div className="pages-list">
          {pages.map(page => (
            <div 
              key={page.id} 
              className={`page-item ${selectedPage === page.id ? 'selected' : ''}`}
              onClick={() => saveSelectedPage(page.id, page.title)}
            >
              {page.icon && <span className="page-icon">{page.icon}</span>}
              <span className="page-title">{page.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 5. Background Operation

The application runs as a system tray application, with minimal visual presence:

```rust
fn main() {
    tauri::Builder::default()
        // Other configuration...
        .system_tray(
            tauri::SystemTray::new()
                .with_menu(
                    tauri::SystemTrayMenu::new()
                        .add_item(tauri::CustomMenuItem::new("settings", "Settings"))
                        .add_item(tauri::CustomMenuItem::new("quit", "Quit"))
                )
        )
        .on_system_tray_event(|app, event| match event {
            tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "settings" => {
                        notion_quick_notes::show_settings(app.app_handle());
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        // Run the application
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Error Handling

The application implements robust error handling through a dedicated error module:

```rust
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Notion API error: {0}")]
    NotionApiError(String),
    
    #[error("Hotkey registration error: {0}")]
    HotkeyError(String),
    
    #[error("Filesystem error: {0}")]
    FsError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Unknown error: {0}")]
    UnknownError(String),
}
```

User-friendly error messages are displayed for common issues:
- Notion API errors (rate limits, authentication failures)
- Network connectivity problems
- Hotkey registration conflicts
- Invalid Page ID selection

## Testing Strategy

1. **Unit Tests**
   - Test Rust backend components in isolation
   - Test React components with Jest and React Testing Library

2. **Integration Tests**
   - Test the communication between React frontend and Rust backend
   - Verify global hotkey registration and handling
   - Test Notion API client with mock responses

3. **End-to-End Tests**
   - Manual testing of the full application workflow
   - Performance testing to ensure low resource usage

## Development Phases

### Phase 1: MVP (Minimum Viable Product)
- Basic note input window triggered by ALT+Q
- Simple settings UI for API token and page selection
- Core Notion API integration (authentication and append note)
- System tray functionality

### Phase 2: Enhancements
- Rich text formatting options
- Offline mode with local storage
- Custom hotkey configuration
- Startup on boot option
- Auto-updates

### Phase 3: Advanced Features
- Multiple Notion page targets with quick selection
- Note templates
- Image capture and attachment
- Tagging system

## Performance Considerations

1. **Startup Time**
   - Lazy loading of non-critical components
   - Minimal dependencies

2. **Memory Usage**
   - Small memory footprint (target: <50MB when idle)
   - Efficient resource management

3. **Battery Impact**
   - Minimal background processing
   - Efficient event handling

## Packaging and Distribution

1. **Windows Installer**
   - Create MSI installer with WiX Toolset
   - Sign application with code signing certificate

2. **Auto-Updates**
   - Implement update checking on startup
   - Silent background updates

## Conclusion

This development plan outlines the architecture, implementation details, and development phases for the Notion Quick Notes application. The chosen technology stack (Tauri + React) provides the optimal balance of performance, resource usage, and development efficiency for this lightweight Windows desktop application.