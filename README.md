# VAM Seek - 2D Video Seek Marker

**A 2D visual seek grid for videos.**
**Navigate any video by scenes, not timestamps.**
**Client-side only. Zero server cost. Zero privacy risk.**

[![License: Dual](https://img.shields.io/badge/License-Dual%20(Free%20%2F%20Commercial)-blue.svg)](LICENSE)
[![Size](https://img.shields.io/badge/Size-~43KB-green.svg)](dist/vam-seek.js)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen.svg)](#)
[![Browser](https://img.shields.io/badge/Works%20in-All%20Modern%20Browsers-orange.svg)](#)

[![Try Live Demo](https://img.shields.io/badge/🎬_Try_Live_Demo-Click_Here-ff6b6b?style=for-the-badge)](https://haasiy.main.jp/vam_web/deploy/demo/index.html)

https://github.com/user-attachments/assets/395ff2ec-0372-465c-9e42-500c138eb7aa

> I built this because I was frustrated with blind scrubbing in long videos.

## Stop Blind Scrubbing

| Traditional Seek Bar | VAM Seek |
|---------------------|----------|
| 1D timeline, trial-and-error | 2D grid, instant visual navigation |
| Server-generated thumbnails | Client-side canvas extraction |
| Heavy infrastructure | Zero server load, ~43KB JS |
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

### Alternative: Standalone Demo

Want a ready-to-use page without integration? Download [deploy/demo/index.html](deploy/demo/index.html) - a single HTML file with all features built-in. No library import needed.

## API

```javascript
const vam = VAMSeek.init({
  video: document.getElementById('video'),
  container: document.getElementById('grid'),
  columns: 5,
  secondsPerCell: 15,
  onSeek: (time, cell) => console.log(`Seeked to ${time}s`),
  onError: (err) => console.error('Error:', err)
});

// Methods
vam.seekTo(120);              // Seek to 2:00
vam.moveToCell(2, 3);         // Move to column 2, row 3
vam.configure({ columns: 8 }); // Update settings
vam.destroy();                // Clean up
```

## Features

- Client-side frame extraction (Canvas API, no server)
- Multi-video LRU cache (5 videos, max 500 frames each)
- Blob URL thumbnails (memory efficient)
- 60fps marker animation
- No globals, multiple instances, clean destroy

## Privacy & Architecture

**Your video never leaves the browser.**

All frame extraction happens client-side using the Canvas API. When the page closes, everything is gone. No data is ever sent to any server.

| Traditional | VAM Seek |
|-------------|----------|
| Video uploaded to server | Video stays in browser |
| Server-side FFmpeg processing | Client-side Canvas API |
| CDN bandwidth costs | Zero server cost |
| Privacy risk | Fully private |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Arrow Keys` | Move marker by cell |
| `Space` | Play/Pause |
| `Home` | First cell |
| `End` | Last cell |

## Browser Support

- Chrome 80+, Firefox 75+, Safari 14+, Edge 80+
- Mobile browsers (iOS Safari, Chrome for Android)

## The Evolution to 43KB

Wait, didn't I say 15KB before? Yes, I did. As a developer, I was obsessed with that 15KB. But after seeing over 10,000 people access this tool, I realized that my mission wasn't just to make it "small," but to make it "indispensable."

I chose to **trade those bytes for a significantly better user experience**:

### Multi-Video LRU Cache
VAM Seek now "remembers" thumbnail grids for up to 5 videos. Switch back to a video you've seen, and the grid appears instantly. No re-extraction, no waiting.

### Reliability & Stability
I've crushed several bugs discovered during the initial surge. The code now handles various video formats and edge cases gracefully.

### Smooth Physics
The marker movement uses refined easing for that 60fps "buttery smooth" feel.

---

Even at 43KB, it remains **ultra-lightweight**. This is the balance between "minimal code" and "maximum experience."

## License & Spirit

**For Individuals:** I want this to be a new standard for video navigation. Please use it, enjoy it, and share your feedback. It's free for personal and educational use.

**For Developers:** Feel free to experiment! This logic is my gift to the community.

**For Commercial Use & Pirates:** If you want to use this to generate revenue or create a paid derivative, you must obtain a commercial license. I built this with passion and 30 years of design experience—I will not tolerate those who try to profit from "pirated" versions of this logic without permission.

For commercial licensing inquiries: haasiy@gmail.com

## Changelog

**Current: v1.3.5**

### v1.3.5 (2026-01-18)
- Frame cache limit: max 500 frames per video (memory optimization)

### v1.3.x (2026-01-18)
- Multi-video LRU cache (5 videos)
- Mobile touch support
- Auto-scroll modes (center/edge/off)
- Added minified version: `vam-seek.min.js` (~20KB)

### v1.0 (2026-01-10)
- Initial release
- Client-side frame extraction
- 2D grid navigation

## Examples

- [VAM Seek × AI](https://github.com/unhaya/vam-seek-electron-demo) - Desktop app with AI video analysis. One grid image, one API call, full video understanding. *Experimental*

https://github.com/user-attachments/assets/77fb3661-4667-47d6-a4f1-3bae18653c51

## Credits

Evolved from [VAM Desktop](https://github.com/unhaya/VAM-original).

## Media Coverage

- [VAM Seek: 2D Visual Navigation for Videos Without Server Load](https://ecosistemastartup.com/vam-seek-navegacion-visual-2d-para-videos-sin-carga-en-servidores/) - Ecosistema Startup
- [VAM Seek: Lightweight 2D Video Navigation Without Server Load](https://pulse-scope.ovidgame.com/2026-01-11-13-14/vam-seek-lightweight-2d-video-navigation-without-server-load) - Pulse Scope
