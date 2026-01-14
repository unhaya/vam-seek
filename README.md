# VAM Seek - 2D Video Seek Marker
(Video Archive Manager)

[![License: Dual](https://img.shields.io/badge/License-Dual%20(Free%20%2F%20Commercial)-blue.svg)](LICENSE)
[![Size](https://img.shields.io/badge/Size-~15KB%20(minified)-green.svg)](dist/vam-seek.js)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen.svg)](#)
[![Browser](https://img.shields.io/badge/Works%20in-All%20Modern%20Browsers-orange.svg)](#)

[![Try Live Demo](https://img.shields.io/badge/🎬_Try_Live_Demo-Click_Here-ff6b6b?style=for-the-badge)](https://haasiy.main.jp/vam_web/deploy/demo/index.html)

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

## Quick Start

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
- **Per-video LRU cache** - Up to 3 videos cached (200 frames each), instant switching
- **Per-video grid settings** - Each video remembers its columns & interval
- **Race condition prevention** - Safe video switching without loading freezes
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

## Installation

```html
<script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>
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

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for full API documentation.

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

### 2026-01-14: Center-Following Auto-Scroll
- Auto-scroll now keeps marker at viewport center (VAM 5.70 style)
- Smoother viewing experience during playback

### 2026-01-13: Multi-Video Support
- LRU cache for up to 3 videos (instant switching)
- Per-video grid settings persistence
- Task-based frame extraction with clean abort

### 2026-01-10: Initial Release
- Client-side frame extraction (Canvas API)
- VAM algorithm for 2D timestamp calculation
- React/Vue integration examples

## Credits

Based on [VAM Desktop](https://github.com/unhaya/VAM-original) application algorithms.

## Media Coverage

- [VAM Seek: 2D Visual Navigation for Videos Without Server Load](https://ecosistemastartup.com/vam-seek-navegacion-visual-2d-para-videos-sin-carga-en-servidores/) - Ecosistema Startup (Jan 2026)
- [VAM Seek: Lightweight 2D Video Navigation Without Server Load](https://pulse-scope.ovidgame.com/2026-01-11-13-14/vam-seek-lightweight-2d-video-navigation-without-server-load) - Pulse Scope (Jan 2026)
