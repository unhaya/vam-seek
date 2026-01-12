# VAM Seek - 2D Video Seek Marker

[![License: Dual](https://img.shields.io/badge/License-Dual%20(Free%20%2F%20Commercial)-blue.svg)](LICENSE)
[![Size](https://img.shields.io/badge/Size-~15KB%20(minified)-green.svg)](dist/vam-seek.js)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen.svg)](#)
[![Browser](https://img.shields.io/badge/Works%20in-All%20Modern%20Browsers-orange.svg)](#)

[![Try Live Demo](https://img.shields.io/badge/🎬_Try_Live_Demo-Click_Here-ff6b6b?style=for-the-badge)](https://haasiy.main.jp/vam_web/deploy/lolipop/index.html)

https://github.com/user-attachments/assets/395ff2ec-0372-465c-9e42-500c138eb7aa

**A lightweight 2D video seek grid library for video streaming sites.**

Navigate videos visually with a thumbnail grid instead of a 1D seek bar. Client-side frame extraction with smooth marker animation.

> 🎯 **Stop blind scrubbing. See every scene at once.**

## Why VAM Seek?

| Traditional Seek Bar | VAM Seek |
|---------------------|----------|
| 1D timeline, trial-and-error | 2D grid, instant visual navigation |
| Server-generated thumbnails | Client-side canvas extraction |
| Heavy infrastructure | Zero server load, ~15KB JS |
| Complex integration | One-line setup |

**Keywords:** video player, video seek, thumbnail grid, video navigation, HTML5 video, JavaScript library, video streaming, media player, video controls, video thumbnails, seek bar alternative, video UX

## Quick Start (For External Sites)

```html
<!-- 1. Add the script -->
<script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>

<!-- 2. Connect to your video -->
<script>
  VAMSeek.init({
    video: document.getElementById('myVideo'),
    container: document.getElementById('seekGrid'),
    columns: 5,
    secondsPerCell: 15
  });
</script>
```

That's it. See [docs/INTEGRATION.md](docs/INTEGRATION.md) for full documentation.

## Features

- **Client-side frame extraction** - No server CPU usage
- **Multi-video LRU cache** - Intelligent caching for up to 3 videos (200 frames each)
- **Race condition prevention** - Safe video switching without loading freezes
- **Smooth marker animation** - 60fps with requestAnimationFrame
- **VAM algorithm** - Precise timestamp calculation
- **Framework support** - React, Vue, vanilla JS examples included

## 📰 Media Coverage

- [VAM-Seek: Navegación Visual 2D para Videos sin Carga en Servidores](https://ecosistemastartup.com/vam-seek-navegacion-visual-2d-para-videos-sin-carga-en-servidores/) - Ecosistema Startup (Jan 2026)

## Privacy & Architecture

**Your video never leaves the browser.**

Traditional thumbnail systems upload videos to a server, process with FFmpeg, store thumbnails, and serve via CDN. This costs money, takes time, and raises privacy concerns.

VAM Seek works differently:

| Traditional | VAM Seek |
|-------------|----------|
| Video uploaded to server | Video stays in browser |
| Server-side FFmpeg processing | Client-side Canvas API |
| Thumbnails stored on disk | Frames cached in memory |
| CDN bandwidth costs | Zero server cost |
| Privacy risk | Fully private |

All frame extraction happens in the user's browser using the Canvas API. When the page closes, everything is gone. No data is ever sent to any server.

## Why 2D Grid Seek?

**Long videos are no longer watched from start to finish.**

We search. We go back. We verify.

The UI for this just didn't exist.

### The Reality of Video Watching

- 80-90%: Passive watching (1D seek bar is perfect)
- 10-20%: "Where was that scene?" / "I want to see that again" / "Skip this part"

The 1D seek bar excels at passive viewing. But for **active exploration**, it fails.

### Why This Design Works

| Principle | Implementation |
|-----------|----------------|
| Don't replace, supplement | 1D stays for normal use, 2D appears when needed |
| Zero learning curve | One click to show, click thumbnail to jump |
| Zero cognitive load | "Let me check" → Already visible |
| Disappears when not needed | Closes naturally, no mode switching |

### Why 1D Will Always Exist

The 1D seek bar is:
- Lightweight
- Universally understood
- Optimized for touch/mouse
- Perfect for passive viewing

**2D doesn't replace 1D. It handles what 1D cannot: exploration.**

### The Mark of Standard UI

Good UI has these properties:
- Doesn't break existing workflows
- Appears only when needed
- Understood instantly
- Missed when removed

VAM Seek satisfies all four. Once you use it, going back feels incomplete.

---

> **Note:** This UI is based on a design concept I call **"Grid Seek Marker"** — a time-exploration interface where video becomes a 2D navigable space. VAM Seek is the implementation; Grid Seek Marker is the idea.

## Directory Structure

```
VAM_web/
├── dist/                       # Distributable files
│   └── vam-seek.js             # Standalone library (1 file, ~15KB)
│
├── docs/                       # Documentation
│   └── INTEGRATION.md          # API integration guide
│
├── examples/                   # Integration examples
│   ├── basic-integration.html  # Vanilla JS example
│   ├── react-integration.jsx   # React component & hook
│   └── vue-integration.vue     # Vue 3 component
│
├── backend/                    # FastAPI backend (for demo)
│   ├── main.py                 # Entry point, static file serving
│   ├── requirements.txt        # Python dependencies
│   ├── core/                   # Core logic
│   │   ├── grid_calc.py        # VAM grid calculation
│   │   └── video_utils.py      # FFmpeg video processing
│   ├── models/                 # Pydantic schemas
│   │   └── schemas.py          # Request/response models
│   ├── routers/                # API routers
│   │   ├── grid.py             # /api/grid/* endpoints
│   │   └── video.py            # /api/video/* endpoints
│   ├── uploads/                # Uploaded videos (gitignore)
│   └── thumbnails/             # Generated thumbnails (gitignore)
│
├── frontend/                   # Demo frontend
│   ├── index.html              # Main UI with embedded JS
│   └── assets/
│       └── marker.svg          # Grid marker icon
│
├── .gitignore
└── README.md
```

## For Library Users

### Installation Options

**CDN (Recommended)**
```html
<script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>
```

**npm**
```bash
npm install vam-seek
```

### Basic Usage

```javascript
const vam = VAMSeek.init({
  video: document.getElementById('video'),
  container: document.getElementById('grid'),
  columns: 5,
  secondsPerCell: 15,
  onSeek: (time, cell) => {
    console.log(`Seeked to ${time}s`);
  }
});

// API
vam.seekTo(120);           // Seek to 2:00
vam.moveToCell(2, 3);      // Move to column 2, row 3
vam.configure({ columns: 8 }); // Update settings
vam.destroy();             // Clean up
```

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `video` | HTMLVideoElement | required | Target video element |
| `container` | HTMLElement | required | Container for the grid |
| `columns` | number | 3 | Grid columns (3-10) |
| `secondsPerCell` | number | 5 | Seconds per cell |
| `cacheSize` | number | 200 | LRU cache size |
| `onSeek` | function | null | Seek callback |

## For Demo Development

### Requirements

- Python 3.9+
- FFmpeg (in PATH)

### Setup

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Open `http://localhost:8000`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve frontend |
| GET | `/api/health` | Health check |
| POST | `/api/grid/config` | Calculate grid dimensions |
| POST | `/api/grid/position` | Calculate timestamp from position |
| POST | `/api/video/upload` | Upload video (demo only) |

## Technical Details

### Frame Extraction (Client-side)

```javascript
// 1. Create hidden video element
const video = document.createElement('video');
video.src = 'video.mp4';

// 2. Seek to timestamp
video.currentTime = 15.0;

// 3. Capture on seeked event
video.addEventListener('seeked', () => {
  const canvas = document.createElement('canvas');
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
});

// 4. Cache with LRU (max 200 frames per video)
frameCache.put(timestamp, dataUrl);
```

### Multi-Video LRU Cache (2025-01-13)

```javascript
class FrameCache {
  constructor(maxFramesPerVideo = 200, maxVideos = 3) {
    this.caches = new Map(); // videoUrl -> Map(timestamp -> dataUrl)
  }

  setCurrentVideo(videoUrl) {
    // LRU: Move existing video to end, or create new cache
    if (this.caches.size >= this.maxVideos) {
      // Delete oldest video (first entry)
      const oldestUrl = this.caches.keys().next().value;
      this.caches.delete(oldestUrl);
    }
  }
}

// Usage: Keeps last 3 videos cached (600 frames total = ~3-6MB)
const frameCache = new FrameCache(200, 3);
```

**Benefits:**
- Switch between videos without re-extracting frames
- Automatic memory management (oldest video auto-deleted)
- No race conditions when rapidly switching videos

### VAM Algorithm

```javascript
// X-continuous timestamp calculation
function calculateTimestamp(x, y, gridWidth, gridHeight, duration, secondsPerCell) {
  const rowIndex = Math.floor(y / gridHeight * rows);
  const colContinuous = x / gridWidth * columns;
  const cellIndex = rowIndex * columns + colContinuous;
  return Math.min(cellIndex * secondsPerCell, duration);
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Arrow Keys` | Move marker by cell |
| `Space` | Play/Pause |
| `Home` | First cell |
| `End` | Last cell |

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+
- Mobile browsers

## License

Free for personal, educational, and research use.
Commercial use requires a paid license. Contact: info@haasiy.jp

## Development History

### 2025-01-13: Multi-Video Cache System

- **LRU video-aware cache** - Manages up to 3 videos intelligently
- **Race condition fix** - Prevents loading freeze when rapidly switching videos
- **Memory optimization** - Automatic oldest-video eviction (3-6MB max)
- **Process abort mechanism** - Clean interruption of frame extraction
- **Debug logging** - Console logs for cache hits, video switches, extraction progress

### 2025-01-10: Library Release

- Standalone `vam-seek.js` for external integration
- Integration documentation
- React, Vue examples

### 2025-01-10: Initial Release

- FastAPI backend with modular architecture
- Client-side frame extraction (video + canvas)
- VAM-compliant marker movement (X-continuous mode)
- LRU frame cache with fade-in animation
- Scroll position fix
- Same-origin serving for CORS

## Credits

Based on [VAM Desktop](https://github.com/unhaya/VAM-original) application algorithms:
- `vam5.70/utils/video_utils.py` - calculate_x_continuous_timestamp
- `vam5.70/gui/preview/core/grid_calculator.py` - GridCalculator

> **Note:** This is the original codebase—a 100k-line functional application built with raw effort. It's messy, but it was the foundation for VAM-Seek's 15KB condensation.
