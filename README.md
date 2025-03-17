# Notion Quick Notes

A lightweight Windows desktop application for quick note capture to Notion. Capture notes using the global hotkey (ALT+Q) and append them to a selected Notion page, along with a timestamp.

![Notion Quick Notes](screenshot.png)

## Features

- **Global Hotkey (ALT+Q)**: Quickly capture notes from anywhere on your system
- **Minimalist Interface**: Clean, distraction-free note input
- **Notion Integration**: Connect to your Notion workspace and select a target page
- **Timestamps**: Automatically adds timestamps in the format `[DD MMM YY, HH:MM:SS]`
- **System Tray**: Runs silently in the background
- **Dark Mode**: Customizable light and dark theme support
- **First-Time Setup Guide**: Helpful onboarding for new users
- **Offline Support**: Detects network status and provides appropriate feedback

## Setup

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v14 or newer)
- Notion account and API token

### Installation

#### Option 1: Download the Installer
Download the latest installer from the [Releases](https://github.com/AlexGrama7/notion-quick-notes/releases) page.

#### Option 2: Build from Source
1. Clone the repository or download the source code
2. Install dependencies:
   ```
   npm install
   ```
3. Build the application:
   ```
   npm run tauri build
   ```
4. The built installer will be in:
   - `target/release/bundle/nsis/Notion Quick Notes_x.x.x_x64-setup.exe`
   - `target/release/bundle/msi/Notion Quick Notes_x.x.x_x64_en-US.msi`

### Development

1. Run the development version with hot-reloading:
   ```
   npm run tauri dev
   ```
2. Test changes immediately without rebuilding

## Usage

### First-time Setup

1. Obtain a Notion API token:
   - Go to [Notion Developers](https://developers.notion.com/)
   - Create a new integration
   - Copy the "Internal Integration Token"

2. Configure the application:
   - The Settings page will appear automatically on first launch
   - Or right-click on the system tray icon and select "Settings"
   - Paste your Notion API token and click "Verify Token"
   - Click "Fetch Pages" to see available pages
   - Select a target page and click "Save Selected Page"

3. Share your Notion pages with your integration:
   - In Notion, open the page you want to use
   - Click "Share" and add your integration

### Taking Notes

1. Press ALT+Q from anywhere to open the note input window
2. Type your note
3. Press Ctrl+Enter to save or Esc to cancel
4. The note will be appended to your selected Notion page with a timestamp

## Configuration

All settings are stored locally in the app configuration directory:
- Windows: `%APPDATA%\notion-quick-notes\config.json`

## Keyboard Shortcuts

- **Alt+Q**: Open the quick note window (global)
- **Ctrl+Enter**: Save the current note
- **Esc**: Cancel and close the note window

## Recent Updates

### v0.1.0 (March 2025)

- **Initial Release**
- Core functionality: global hotkey, note input, Notion integration

### Recent Improvements

- **Added Dark Mode**: Toggle between light and dark themes
- **Added About Page**: Comprehensive help and setup guide
- **UI Improvements**: Cleaner button layout and better spacing
- **Enhanced Settings**: Added first-time setup guide and improved token validation
- **Offline Detection**: Added warning when network is unavailable
- **Better Error Handling**: More helpful error messages with direct links to settings
- **Theme Persistence**: Remembers your dark/light mode preference
- **Smaller Window Size**: More compact interface for better workflow

## License

MIT
