# Notion Quick Notes

A lightweight Windows desktop application for quick note capture to Notion. Capture notes using the global hotkey (ALT+Q) and append them to a selected Notion page, along with a timestamp.

## Features

- **Global Hotkey (ALT+Q)**: Quickly capture notes from anywhere on your system
- **Minimalist Interface**: Clean, distraction-free note input
- **Notion Integration**: Connect to your Notion workspace and select a target page
- **Timestamps**: Automatically adds timestamps in the format `[DD MMM YY, HH:MM:SS]`
- **System Tray**: Runs silently in the background
- **Modern UI**: Clean, responsive design

## Setup

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v14 or newer)
- Notion account and API token

### Installation

1. Clone the repository or download the source code
2. Install dependencies:
   ```
   npm install
   ```
3. Build the application:
   ```
   npm run tauri build
   ```
4. The built application will be in the `src-tauri/target/release` directory

### Development

1. Run the development version:
   ```
   npm run tauri dev
   ```

## Usage

### First-time Setup

1. Obtain a Notion API token:
   - Go to [Notion Developers](https://developers.notion.com/)
   - Create a new integration
   - Copy the "Internal Integration Token"

2. Configure the application:
   - Right-click on the system tray icon and select "Settings"
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

## License

MIT
