# Technical Context

This document outlines the technologies, development setup, technical constraints, and dependencies for the Notion Quick Notes application.

## Technology Stack

### Frontend
- **React**: Used for the UI components
- **TypeScript**: Provides type safety throughout the application
- **CSS**: Custom styling for components

### Backend
- **Tauri**: Cross-platform framework for building desktop applications
- **Rust**: Powers the backend and provides native performance
- **SQLite**: Used for local storage and queuing

### External APIs
- **Notion API**: Used for creating and managing notes in Notion
- **OpenAI API**: Used for AI-powered completions and suggestions

## Development Environment

### Required Tools
- Node.js 18.x or higher
- Rust toolchain (cargo, rustc)
- Tauri prerequisites (platform-specific)
- npm or yarn package manager

### Build Process
- `npm run dev`: Starts the development server
- `npm run tauri dev`: Launches the Tauri application in development mode
- `npm run build`: Builds the frontend assets
- `npm run tauri build`: Creates the production build of the application

## Code Organization

```
notion-quick-notes/
├── src/               # Frontend source code (React/TypeScript)
│   ├── components/    # React components
│   ├── services/      # Service modules
│   │   ├── ai/        # AI service and related modules
│   │   ├── nlp/       # Natural Language Processing modules
│   │   └── ...        # Other services
│   └── ...
├── src-tauri/         # Rust backend code
│   ├── src/           # Rust source files
│   ├── Cargo.toml     # Rust dependencies
│   └── tauri.conf.json # Tauri configuration
├── public/            # Static assets
├── package.json       # Node.js dependencies
└── ...
```

## Key Services

### Sync Service
- Handles communication with the Notion API
- Manages the offline queue for operations when disconnected
- Implements retry logic with exponential backoff

### AI Service
- Integrates with OpenAI for AI-powered suggestions
- Provides fallback mechanisms for when the API is unavailable
- Implements caching to reduce API usage

### NLP Service
- Processes natural language input to extract structured information
- Detects entities like dates, times, actions, and priorities
- Converts unstructured text into structured Notion database entries
- Implements confidence scoring to determine when to prompt for confirmation

### Network Status Service
- Monitors connectivity to enable offline functionality
- Triggers sync operations when connectivity is restored
- Provides status information to the UI

### Rate Limit Service
- Tracks Notion API rate limits to prevent 429 errors
- Implements queuing when approaching rate limits
- Provides visual feedback about current rate limit status

### Notification Service
- Displays system notifications to the user
- Handles different types of notifications (success, error, warning)

## Technical Constraints

### Notion API Limitations
- Rate limited to 3 requests per second (more specific limits in the docs)
- Token-based authentication
- Limited support for real-time updates
- Some operations require multiple API calls

### Offline Functionality
- Application must function without an internet connection
- Operations need to be queued and processed when connectivity is restored
- Local data needs to be synchronized with Notion when possible

### Cross-Platform Compatibility
- Application must work consistently on Windows, macOS, and Linux
- UI should adapt to different screen sizes and densities

### Performance Constraints
- Startup time should be minimized (target: under 2 seconds)
- Memory usage should be kept reasonable (target: under 200MB)
- CPU usage should be minimal when idle

## Natural Language Processing Implementation

### Entity Extraction
The NLP service uses a combination of techniques to extract entities:

1. **Rule-Based Extraction**:
   - Regular expressions for date/time patterns (e.g., "tomorrow at 3pm")
   - Keyword matching for action items (e.g., "remind me to...")
   - Pattern matching for priorities (e.g., "high priority", "urgent")

2. **Structure Conversion**:
   - Converts extracted entities to Notion-compatible structured data
   - Normalizes dates to ISO 8601 format
   - Maps priorities to predefined levels

3. **Confidence Scoring**:
   - Assigns confidence levels to extracted entities
   - Calculates overall confidence for the processing result
   - Determines whether user confirmation is needed

### Implementation Details
- Entity detection runs on user input when relevant keywords are detected
- Processing is debounced to avoid excessive calculations while typing
- Results are displayed in real-time with color-coded entity highlighting
- User can confirm or discard the structured interpretation

### Technical Debt and Limitations
- Current implementation is primarily rule-based without AI assistance
- Limited language support (primarily English patterns)
- Basic date/time parsing without full natural language understanding
- No handling of complex recurrence patterns for reminders

## Dependencies

### Frontend Dependencies
- React 18.x
- TypeScript 5.x
- Tauri API client
- Custom UI components (no external UI libraries)

### Backend Dependencies
- Tauri
- reqwest (HTTP client for Rust)
- serde (serialization/deserialization)
- tokio (async runtime)
- rusqlite (SQLite bindings)

### Development Dependencies
- Vite (build tool)
- ESLint (linting)
- TypeScript compiler
- Rust toolchain

## Testing Strategy

### Unit Testing
- Jest for JavaScript/TypeScript components and services
- Rust's native testing framework for backend code

### Integration Testing
- End-to-end tests using Tauri's testing utilities
- API mocks for testing without external dependencies

### Manual Testing
- Scenarios for offline/online transitions
- Cross-platform verification on all supported platforms