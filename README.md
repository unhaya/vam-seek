# VAM Seek - 2D Video Seek Marker

[![License: Dual](https://img.shields.io/badge/License-Dual%20(Free%20%2F%20Commercial)-blue.svg)](LICENSE)
[![Size](https://img.shields.io/badge/Size-~15KB-green.svg)](dist/vam-seek.js)
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
- **LRU cache** - 200 frames cached in memory
- **Smooth marker animation** - 60fps with requestAnimationFrame
- **VAM algorithm** - Precise timestamp calculation
- **Framework support** - React, Vue, vanilla JS examples included

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

// 4. Cache with LRU (max 200 frames)
frameCache.put(videoSrc, timestamp, dataUrl);
```

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

### 2025-01-10: Initial Release

- FastAPI backend with modular architecture
- Client-side frame extraction (video + canvas)
- VAM-compliant marker movement (X-continuous mode)
- LRU cache with fade-in animation
- Scroll position fix
- Same-origin serving for CORS

### 2025-01-10: Library Release

- Standalone `vam-seek.js` for external integration
- Integration documentation
- React, Vue examples

## Credits

Based on VAM Desktop application algorithms:
- `vam5.70/utils/video_utils.py` - calculate_x_continuous_timestamp
- `vam5.70/gui/preview/core/grid_calculator.py` - GridCalculator
