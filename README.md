# Notion Quick Notes

A lightweight Windows desktop application for quick note capture to Notion. Capture notes using the global hotkey (ALT+Q) and append them to a selected Notion page, along with a timestamp.

![Notion Quick Notes](screenshot.png)

## Features

- **Global Hotkey (ALT+Q)**: Quickly capture notes from anywhere on your system
- **Minimalist Interface**: Clean, distraction-free note input
- **Notion Integration**: Connect to your Notion workspace and select a target page
- **Timestamps**: Automatically adds timestamps in the format `[DD MMM YY, HH:MM:SS]`
- **System Tray**: Runs silently in the background with quick access to settings and about
- **Dark Mode**: Customizable light and dark theme support with persistent preferences
- **First-Time Setup Guide**: Helpful onboarding for new users
- **Offline Support**: Detects network status and provides appropriate feedback
- **Improved Window Management**: Smart window handling for settings and note input
- **Enhanced Error Handling**: Clear error messages with direct settings access
- **Responsive UI**: Optimized window sizes and improved button layouts

## Planned Features

- **Quick Reference Panel**: Collapsible sidebar showing recently captured notes for easy reference and re-use
- **Search History**: Integrated search functionality to quickly find previously taken notes without leaving the app

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

### v0.2.0 (Latest)

- **Window Management Improvements**
  - Fixed settings window handling to prevent app crashes
  - Improved window reuse instead of recreating windows
  - Better window focus management
  - Smoother transitions between note input and settings

- **UI/UX Enhancements**
  - Improved button alignment and consistency
  - Enhanced window title handling
  - Better window size optimization
  - Cleaner transitions between views

- **System Tray Improvements**
  - More reliable settings window access
  - Added About page access
  - Smoother window state management

- **Error Handling**
  - Added comprehensive error logging
  - Improved error messages with actionable feedback
  - Better handling of window state errors

- **Performance Optimizations**
  - Reduced window creation overhead
  - Improved state management
  - Better resource handling

### v0.1.0 (Initial Release)

- Core functionality: global hotkey, note input, Notion integration
- Dark mode support
- About page
- UI improvements
- Enhanced settings
- Offline detection
- Theme persistence

## License

MIT

## Build Instructions

This Tauri application can be built by running:

   npm run tauri build

The build produces the following installers:

   - MSI: target/release/bundle/msi/Notion Quick Notes_0.1.0_x64_en-US.msi
   - NSIS: target/release/bundle/nsis/Notion Quick Notes_0.1.0_x64-setup.exe
