<!-- PROJECT LOGO -->

[link-chrome]: https://chromewebstore.google.com/detail/youtube-time-manager/ikhkekdjdjpklbpmgloalpapjgfolheh "Chrome Web Store"

<br />
<p align="center">
  <a href="https://github.com/olivierluethy/YouTube-Time-Manager">
    <img src="icon/icon.png" alt="YouTube Time Manager Logo" width="200" height="200">
  </a>

  <h3 align="center">YouTube Time Manager</h3>
  <h4 align="center">Understand your YouTube habits. Track time, discover patterns, get insights.</h4>

  <p align="center">
    A privacy-first Chrome extension that tracks your YouTube watch time and gives you actionable insights about your viewing habits.
    <br />
    <br />
    <a href="https://github.com/olivierluethy/YouTube-Time-Manager/issues">Report Bug</a>
    &middot;
    <a href="https://github.com/olivierluethy/YouTube-Time-Manager/issues">Request Feature</a>
  </p>
</p>

---

<details open="open">
  <summary><strong>Table of Contents</strong></summary>
  <ol>
    <li><a href="#project-overview">Project Overview</a></li>
    <li><a href="#architecture--structure">Architecture & Structure</a></li>
    <li><a href="#technologies-used">Technologies Used</a></li>
    <li><a href="#core-features--implementation">Core Features & Implementation</a></li>
    <li><a href="#setup--installation">Setup & Installation</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#development-notes">Development Notes</a></li>
    <li><a href="#future-improvements">Future Improvements</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#disclaimer">Disclaimer</a></li>
  </ol>
</details>

---

## Project Overview

**YouTube Time Manager** is a Chrome extension that passively tracks how much time you spend watching YouTube and breaks it down by video, channel, and category. Instead of blocking content or restricting access, it focuses on giving you a clear picture of your viewing habits so you can make informed decisions about how you spend your time.

### Key Use Cases

- **Self-awareness**: See exactly how much YouTube you watch per day and per week.
- **Category tracking**: Organize channels into categories (Education, Entertainment, Gaming, etc.) and see where your time goes.
- **Pattern discovery**: Get auto-generated insights like "75% of your time is Education" or "You spend 3x more time on Gaming than anything else."
- **Data ownership**: All data stays on your machine. No accounts, no cloud sync, no telemetry.

### Download

<div align="center">

[<img src="https://user-images.githubusercontent.com/574142/232173820-eea32262-2b0f-4ec6-8a38-b1c872981d75.png" height="67" alt="Available on Chrome Web Store" valign="middle">][link-chrome]

</div>

---

## Architecture & Structure

The extension follows Chrome's Manifest V3 architecture with three main components that communicate through Chrome's messaging API.

### File Structure

```
YouTube-Time-Manager/
├── manifest.json       # Extension configuration (Manifest V3)
├── content.js          # Content script — injected into YouTube pages
├── background.js       # Service worker — data aggregation and storage
├── popup.html          # Popup dashboard UI
├── popup.js            # Popup dashboard logic
├── popup.css           # Popup dashboard styles
├── options.html        # Settings page UI
├── options.js          # Settings page logic
├── options.css         # Settings page styles
└── icon/               # Extension icons (16px, 48px, 128px)
```

There are no build tools, bundlers, or external dependencies. The extension loads directly from source files.

### Component Interaction

```
YouTube Tab (content.js)
  │
  │  Sends HEARTBEAT messages every 5 seconds while a video plays
  ▼
Service Worker (background.js)
  │
  │  Aggregates time into chrome.storage.local
  │  Stores: videos, channels, daily stats, categories
  │
  ├──► Popup Dashboard (popup.js)
  │      Reads storage on open, displays today/weekly stats
  │      Sends SET_CHANNEL_TAG when user assigns a category
  │
  └──► Settings Page (options.js)
         Full channel management, category editor, weekly charts, data tools
         Sends SET_CHANNEL_TAG for category assignments
```

**Message types:**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `HEARTBEAT` | content.js → background.js | Report 5 seconds of watch time for a video |
| `SET_CHANNEL_TAG` | popup.js / options.js → background.js | Assign a channel to a category |
| `GET_STORAGE` | Any → background.js | Read stored data |

---

## Technologies Used

| Technology | Purpose |
|---|---|
| **JavaScript (ES6+)** | All application logic — no frameworks or libraries |
| **HTML5** | Popup and settings page markup |
| **CSS3** | Styling with custom properties, flexbox, and CSS Grid |
| **Chrome Extensions Manifest V3** | Service workers, content scripts, extension APIs |
| **Chrome Storage API** | Local persistent data storage |
| **Chrome Runtime Messaging** | Communication between extension components |
| **Chrome Tabs API** | Tab state awareness for the content script |

No npm packages, no build step, no transpilation. The entire extension is vanilla JavaScript running on Chrome's native APIs.

---

## Core Features & Implementation

### 1. Real-Time Video Tracking

The content script (`content.js`) is injected into every YouTube page and detects video playback using a **heartbeat mechanism**.

**How it works:**

- When a YouTube video starts playing, the script attaches event listeners to the `<video>` element.
- Every 5 seconds, while the video is actively playing, a `HEARTBEAT` message is sent to the background service worker.
- The heartbeat includes the video ID, title, channel name, and channel ID.
- Tracking pauses when the tab is hidden or the video is paused, and resumes automatically.

**Handling YouTube's SPA navigation:**

YouTube is a single-page application — navigating between videos doesn't trigger a full page reload. The content script listens for YouTube's custom `yt-navigate-finish` event to detect soft navigations and re-initialize tracking for the new video.

**Robust metadata extraction:**

YouTube's DOM structure varies across page types and A/B tests. The script tries multiple CSS selectors to extract the video title and channel name:

```javascript
const title =
  document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
  document.querySelector('#title h1 yt-formatted-string')?.textContent?.trim() ||
  document.querySelector('h1.title')?.textContent?.trim() ||
  document.title.replace(/ - YouTube$/, '').trim();
```

**Channel ID resolution:**

Channel IDs are derived from the channel link's `href` attribute, supporting both `/channel/UC...` and `/@handle` URL formats, with a name-based fallback.

### 2. Data Aggregation Engine

The service worker (`background.js`) receives heartbeats and maintains a three-level storage hierarchy:

```
chrome.storage.local
├── videos     → Per-video metadata (title, channel, total seconds, dates)
├── channels   → Per-channel info (name, assigned category)
├── daily      → Date-keyed stats (total time, time by category, time by channel)
└── tags       → Category definitions (name → color)
```

**Key design decision — retroactive re-attribution:**

When a user assigns a channel to a category, the engine doesn't just apply it going forward. It walks through *all* historical daily records and re-attributes that channel's time from its old category to the new one. This means your analytics are always consistent, even for past data.

```javascript
for (const day of Object.values(daily)) {
  const secs = day.byChannel[channelId] || 0;
  day.byTag[oldTag] = Math.max(0, (day.byTag[oldTag] || 0) - secs);
  day.byTag[newTag] = (day.byTag[newTag] || 0) + secs;
}
```

### 3. Popup Dashboard

The popup (`popup.html` / `popup.js`) is the primary interface, accessible by clicking the extension icon. It provides:

- **Period toggle**: Switch between "Today" and "This Week" views.
- **Summary cards**: Total watch time, number of videos watched, and top category.
- **Auto-generated insights**: Contextual statements about viewing patterns (e.g., "75% of your time is Education" or "You spend 3x more time on Gaming than anything else").
- **Category breakdown**: Horizontal bar charts showing time distribution across categories.
- **Top channels**: The 5 most-watched channels with inline category assignment.

**Inline category assignment:**

Users can tag any channel directly from the popup by clicking "+Tag" next to a channel name. A dropdown appears with existing categories, plus the ability to create a new one by typing a name. The tag is applied immediately and all historical stats are recalculated.

### 4. Settings Page

The settings page (`options.html` / `options.js`) provides four tabs:

| Tab | Purpose |
|-----|---------|
| **Channels** | Searchable list of all tracked channels with category assignment dropdowns |
| **Categories** | Create/delete categories, assign colors, see channel counts per category |
| **Weekly Stats** | Bar chart of daily usage over the last 7 days + weekly category breakdown |
| **Data** | Aggregate statistics (total videos, days tracked, channels) + clear all data |

**Design decisions:**

- Destructive actions (delete category, clear data) require confirmation through a modal dialog.
- Toast notifications provide feedback after actions (e.g., "Marketing tagged as Entertainment").
- The channel list is filterable by search, so it scales as the user watches more channels.

### 5. Default Categories

On first install, the extension seeds these default categories with assigned colors:

Entertainment, Education, Music, Gaming, News, Tech, Sports, Other

Users can add custom categories at any time through the settings page or inline from the popup.

---

## Setup & Installation

### From the Chrome Web Store

1. Visit the [Chrome Web Store listing][link-chrome].
2. Click **Add to Chrome**.
3. The extension icon will appear in your toolbar.

### From Source (Developer Mode)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/olivierluethy/YouTube-Time-Manager.git
   ```

2. **Open Chrome's extension manager:**

   Navigate to `chrome://extensions/` in your browser.

3. **Enable Developer Mode:**

   Toggle the switch in the top-right corner.

4. **Load the extension:**

   Click **Load unpacked** and select the cloned `YouTube-Time-Manager` folder.

5. **Pin the extension (optional):**

   Click the puzzle piece icon in the toolbar and pin YouTube Time Manager for easy access.

No build step is required. The extension runs directly from the source files.

---

## Usage

### Tracking Watch Time

Once installed, the extension automatically tracks time spent watching YouTube videos. No setup or configuration is needed — just browse YouTube as usual.

### Viewing Your Dashboard

1. Click the **YouTube Time Manager** icon in the Chrome toolbar.
2. The popup shows your stats for **Today** by default.
3. Click **This Week** to see your weekly overview.
4. Review the category breakdown and top channels sections.

### Organizing Channels into Categories

**From the popup:**

1. In the **Top Channels** section, click the **+Tag** button next to any channel.
2. Select an existing category from the dropdown, or type a new category name to create one.

**From the settings page:**

1. Click the gear icon in the popup header to open settings.
2. Go to the **Channels** tab.
3. Use the dropdown next to each channel to assign a category.

### Managing Categories

1. Open the settings page (gear icon in popup).
2. Go to the **Categories** tab.
3. Create new categories with a name and color.
4. Delete categories you no longer need.

### Viewing Weekly Statistics

1. Open the settings page.
2. Go to the **Weekly Stats** tab.
3. View the bar chart showing daily usage over the past 7 days.
4. Review the weekly category breakdown below the chart.

### Clearing Data

1. Open the settings page.
2. Go to the **Data** tab.
3. Click **Clear all data** and confirm in the modal.

---

## Development Notes

### No External Dependencies

The extension uses zero external libraries. All UI components (dropdowns, modals, toasts, charts) are built from scratch with vanilla JavaScript and CSS. This keeps the extension lightweight, fast, and free from supply-chain risks.

### Privacy by Design

- All data is stored in `chrome.storage.local` (device-only, not synced to a Google account).
- The extension makes zero network requests to any external server.
- No analytics, telemetry, or tracking pixels are included.
- Permissions are minimal: only `storage` (to persist data) and `tabs` (to detect tab visibility).

### YouTube SPA Compatibility

YouTube is a single-page application, which means traditional page-load events don't fire when navigating between videos. The content script handles this by listening for YouTube's custom `yt-navigate-finish` event and reinitializing the tracker for each new video. It also handles edge cases like:

- Tab visibility changes (pauses/resumes tracking via the Page Visibility API).
- Video play/pause state changes (attaches listeners directly to the `<video>` element).
- Multiple selector fallbacks for metadata extraction (YouTube frequently changes its DOM structure).

### Deterministic Avatar Colors

Channel avatars in the UI use a hash-based color assignment to ensure each channel always gets the same color across sessions:

```javascript
function avatarColor(name) {
  const colors = ['#F97316','#3B82F6','#8B5CF6','#10B981','#F59E0B','#06B6D4','#EF4444','#EC4899'];
  let hash = 0;
  for (const c of (name || 'X')) hash = (hash * 31 + c.charCodeAt(0)) & 0xFFFFFF;
  return colors[Math.abs(hash) % colors.length];
}
```

### Known Limitations

- **Chrome only**: The extension uses Chrome-specific APIs (Manifest V3) and is not currently compatible with Firefox.
- **No cross-device sync**: Data is stored locally and does not sync across devices.
- **Service worker lifecycle**: Chrome may suspend the service worker after inactivity. The heartbeat mechanism ensures it wakes up every 5 seconds during active playback.
- **DOM selector fragility**: YouTube occasionally changes its DOM structure, which may require updating the metadata extraction selectors.

---

## Future Improvements

- **Firefox support**: Port the extension to Firefox using WebExtension APIs.
- **Data export/import**: Allow users to export their data as JSON or CSV for backup and analysis.
- **Time goals**: Set daily or weekly watch time targets and get notified when approaching limits.
- **Channel-level insights**: Deeper analytics per channel with viewing trends over time.
- **Cross-device sync**: Optional opt-in sync using `chrome.storage.sync` for users who want data across devices.

---

## Name Change History

- **YouRecoHide** — original name
- **YouTube-Disblock** — renamed December 2024
- **YouTube Time Manager** — current name

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Author

- **Olivier Luethy** — Developer and Maintainer

## Disclaimer

YouTube Time Manager does not store any of your information externally. All data is stored locally on your computer using Chrome's storage API. The source code is fully available in this repository for verification. YouTube Time Manager is not affiliated with YouTube or Google.
