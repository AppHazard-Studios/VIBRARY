# VIBRARY

**A privacy-focused browser extension that lets you rate videos and build playlists — across websites, without needing accounts or relying on history.**

---

## 🖼️ Preview

<p align="center">
  <a href="https://github.com/AppHazard-Studios/VIBRARY/blob/main/screenshot.jpg?raw=true" target="_blank">
    <img src="https://github.com/AppHazard-Studios/VIBRARY/blob/main/screenshot.jpg?raw=true" width="600" alt="VIBRARY Preview"/>
  </a>
</p>

---

## 🎯 Overview

**VIBRARY** (short for **Video Library**) is a lightweight browser extension for Chromium browsers like Chrome and Brave.

It lets you keep track of videos you watch, rate them, and organize them into playlists — all without using browser history, cookies, or platform accounts.

It works on **any site that supports Picture-in-Picture** or Chrome's **Now Playing (Media Session)** feature.

---

## ✅ Features

- **Create playlists** across websites
- **Rate videos** (1-5 stars) and filter by rating
- **Edit video details** - Change titles and URLs after saving
- **Thumbnail preview** - See multiple frames from videos on hover
- **Auto-cleanup** - Automatically remove old history items
- **Blacklist sites** - Prevent specific domains from being tracked
- **No sign-in required** — skip account creation
- **No reliance on cookies or browser history**
- **Works fully offline** — all data stays on your device
- **Export/Import** - Backup and restore your library
- **Clean dark popup UI**
- Built with **Manifest V3** for Chromium browsers

---

## 📦 Installation

### From Release
1. Go to the [Releases page](https://github.com/AppHazard-Studios/VIBRARY/releases)
2. Download the latest `.zip`
3. In Chrome or Brave:
   - Visit `chrome://extensions/`
   - Enable **Developer Mode**
   - Click **Load unpacked** and select the unzipped folder

### From Source
1. Clone this repository
2. Open `chrome://extensions/` in your browser
3. Enable **Developer Mode**
4. Click **Load unpacked** and select the repository folder

---

## 🚀 How It Works

### Video Detection
VIBRARY uses two methods to detect videos:
1. **Media Session API** - Captures metadata like title, artist, and thumbnail from sites that support it
2. **Direct video element detection** - Falls back to page title and captures thumbnails directly for other sites

### Duplicate Prevention
- Videos are identified by their page URL
- If you watch the same video within 30 seconds, it won't create a duplicate
- If the title changed (e.g., you edited it), the existing entry is updated

### Thumbnail Capture
- Automatically captures video frames while you watch
- Stores up to 10 thumbnails per video for preview on hover
- Works on sites that allow cross-origin access to video content
- Continues capturing when tab is active (pauses when minimized)

### Storage System
VIBRARY uses a dual storage system:
- **History Storage** (`historyVideos`) - All watched videos
- **Library Storage** (`libraryVideos`) - Only videos added to playlists

This ensures playlist videos are never accidentally deleted during cleanup.

### Data Structure
Each video entry contains:
```javascript
{
  id: "vid_timestamp_randomstring",
  title: "Video Title",
  url: "https://example.com/watch?v=123",
  website: "Example",
  favicon: "https://example.com/favicon.ico",
  thumbnail: "data:image/jpeg;base64,...",
  thumbnailCollection: [
    { time: 15.5, thumbnail: "data:image/jpeg;base64,..." },
    // ... more frames
  ],
  watchedAt: 1234567890,
  rating: 0, // 0-5 stars
  artist: "Channel Name", // if available
  album: "Playlist Name"  // if available
}
```

---

## 🛠️ Configuration

### Auto-Cleanup
- Set in Settings → Auto-Cleanup
- Options: Off, 1 day, 7 days, 30 days, 90 days, 365 days
- Only removes videos from history that aren't in any playlist
- Runs hourly when enabled

### Blacklist
- Add domains to prevent tracking (one per line)
- Supports subdomains (e.g., `example.com` blocks `sub.example.com`)
- Toggle on/off without losing your list

### Export/Import
- Export creates a JSON backup of all data
- Import merges with existing data (won't overwrite)
- Supports migration from older VIBRARY versions

---

## 🔒 Privacy & Security

### Local Storage Only
- All data stored in `chrome.storage.local`
- Nothing sent to external servers
- No analytics or telemetry

### Permissions Used
- `storage` - Save your video library
- `unlimitedStorage` - Store thumbnails without limits
- `activeTab` - Detect videos on current tab
- `scripting` - Inject video detection script
- `<all_urls>` - Work on any video site

### Incognito Mode
- Works in incognito with extension allowed
- Data still saved locally (not tied to incognito session)

---

## 💡 Tips & Tricks

### Keyboard Shortcuts
- Click video title to open in new tab
- Click thumbnail to open video directly

### Managing Large Libraries
- Use search to filter by title or website
- Sort by date (recent first) or rating
- Filter by star rating or unrated videos

### Thumbnail Quality
- Some sites block thumbnail capture (CORS policy)
- Thumbnail capture works best on sites you're logged into
- Preview shows multiple frames captured during viewing

### URL Handling
- Always saves the page URL, not the video file URL
- Handles YouTube, Vimeo, Dailymotion, and most video sites
- Works with embedded videos that use Media Session API

---

## 🐛 Known Limitations

1. **Thumbnail capture** may not work on all sites due to CORS restrictions
2. **Background tabs** pause thumbnail capture to save resources
3. **Some sites** may show generic thumbnails if they block canvas access
4. **Duplicate detection** is based on URL within 30 seconds

---

## 🔧 Technical Details

### File Structure
```
manifest.json    - Extension configuration
background.js    - Service worker for cleanup and lifecycle
content.js       - Video detection and thumbnail capture
popup.html       - Extension UI
popup.css        - Styling
popup.js         - UI logic and data management
```

### Browser Compatibility
- Chrome 88+
- Brave
- Edge (Chromium)
- Other Chromium-based browsers

### Performance
- Thumbnails compressed to JPEG at 70% quality
- Maximum 400px width for storage efficiency
- Cleanup runs in background without affecting browsing

---

## 📩 Support

Questions, ideas, or bug reports? Email **apphazardstudios@gmail.com**

---

## 🔮 Future Ideas

- Sync across devices (optional, privacy-preserving)
- More sorting and filtering options
- Bulk operations (rate multiple, add to playlist)
- Custom thumbnail selection
- Video notes/comments
- Share playlists (export format)

---

## 📄 License

VIBRARY is a proprietary extension by AppHazard Studios. All rights reserved.

---

<!--  
Tags: VIBRARY, video tracker, Chrome extension, Brave extension, video playlists, media session, picture-in-picture, offline extension, incognito support, privacy extension, Manifest V3, video rating, thumbnail capture, video library, cross-site playlists
-->