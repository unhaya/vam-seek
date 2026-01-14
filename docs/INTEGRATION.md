# VAM Seek - Integration Guide

2D Video Seek Marker for Video Streaming Sites

## Quick Start

```html
<script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>
```

Connect to your existing `<video>` element:

```javascript
VAMSeek.init({
    video: document.getElementById('myVideo'),
    container: document.getElementById('seekGrid')
});
```

## Full Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Video Site</title>
    <style>
        .video-container {
            display: flex;
            gap: 20px;
        }
        .player {
            flex: 1;
            max-width: 640px;
        }
        .seek-grid {
            flex: 1;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
            background: #1a1a2e;
            border-radius: 8px;
            padding: 10px;
        }
        video {
            width: 100%;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="video-container">
        <!-- Your existing video player -->
        <div class="player">
            <video id="myVideo" controls>
                <source src="https://your-cdn.com/video.mp4" type="video/mp4">
            </video>
        </div>

        <!-- VAM Seek Grid Container -->
        <div class="seek-grid" id="seekGrid"></div>
    </div>

    <!-- VAM Seek Library -->
    <script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>
    <script>
        const video = document.getElementById('myVideo');
        const grid = document.getElementById('seekGrid');

        // Initialize when video is ready
        video.addEventListener('loadedmetadata', () => {
            const vam = VAMSeek.init({
                video: video,
                container: grid,
                columns: 5,
                secondsPerCell: 15,
                onSeek: (time, cell) => {
                    console.log(`Seeked to ${time}s (cell ${cell.index})`);
                }
            });
        });
    </script>
</body>
</html>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `video` | HTMLVideoElement | required | Your video element |
| `container` | HTMLElement | required | Container for the grid |
| `columns` | number | 3 | Grid columns (3-10 recommended) |
| `secondsPerCell` | number | 5 | Seconds each cell represents |
| `thumbWidth` | number | 160 | Thumbnail width in pixels |
| `thumbHeight` | number | 90 | Thumbnail height in pixels |
| `cacheSize` | number | 200 | LRU cache size (frames per video) |
| `markerSvg` | string | null | Custom marker SVG HTML |
| `onSeek` | function | null | Callback when user seeks |
| `autoScroll` | boolean | true | Enable auto-scroll during playback |
| `scrollBehavior` | string | 'center' | Scroll mode: 'center' or 'edge' |

## API Reference

### VAMSeek.init(options)

Initialize the seek grid.

```javascript
const instance = VAMSeek.init({
    video: videoElement,
    container: containerElement,
    columns: 5,
    secondsPerCell: 15
});
```

### instance.configure(options)

Update configuration dynamically.

```javascript
instance.configure({
    columns: 8,
    secondsPerCell: 10
});
```

### instance.seekTo(time)

Programmatically seek to a time.

```javascript
instance.seekTo(120); // Seek to 2:00
```

### instance.moveToCell(col, row)

Move marker to specific cell.

```javascript
instance.moveToCell(2, 3); // Column 2, Row 3
```

### instance.getCurrentCell()

Get current cell information.

```javascript
const cell = instance.getCurrentCell();
// Returns: { index, col, row, time, cellStartTime, cellEndTime }
```

### instance.destroy()

Clean up and remove the grid.

```javascript
instance.destroy();
```

### VAMSeek.getInstance(video)

Get instance for a video element.

```javascript
const instance = VAMSeek.getInstance(videoElement);
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Arrow Keys` | Move marker by one cell |
| `Home` | Jump to first cell |
| `End` | Jump to last cell |
| `Space` | Play/Pause |

## Custom Styling

Override default styles with CSS:

```css
/* Grid container */
.vam-thumbnail-grid {
    gap: 4px !important;
}

/* Individual cells */
.vam-cell {
    border-radius: 4px !important;
    background: #2a2a4e !important;
}

/* Time labels */
.vam-time {
    font-family: 'Monaco', monospace !important;
    font-size: 10px !important;
}

/* Marker */
.vam-marker svg circle {
    stroke: #00ff00 !important;
}
```

## Customization

### Auto-Scroll Behavior

The grid auto-scrolls to keep the marker visible during playback. You can customize this in `scrollToMarker()`:

**Center-following (default)** - Marker stays at viewport center:
```javascript
function scrollToMarker() {
    const targetScroll = STATE.markerY - viewportHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
}
```

**Edge-trigger** - Only scroll when marker reaches screen edge:
```javascript
function scrollToMarker() {
    const markerTop = STATE.markerY;
    const scrollTop = container.scrollTop;

    if (markerTop < scrollTop + 50) {
        container.scrollTo({ top: Math.max(0, markerTop - 100), behavior: 'smooth' });
    } else if (markerTop > scrollTop + viewportHeight - 50) {
        container.scrollTo({ top: markerTop - viewportHeight + 100, behavior: 'smooth' });
    }
}
```

**Offset from center** - Marker at top 1/3 of viewport:
```javascript
const targetScroll = STATE.markerY - viewportHeight / 3;
```

### Scroll Frequency

Change how often auto-scroll triggers (default: 500ms):

```javascript
// In timeupdate event listener
if (now - lastScrollTime > 500) {  // Change this value (milliseconds)
    scrollToMarker();
    lastScrollTime = now;
}
```

## Custom Marker

Replace the default crosshair:

```javascript
VAMSeek.init({
    video: video,
    container: grid,
    markerSvg: `
        <svg width="32" height="32" viewBox="0 0 32 32">
            <polygon points="16,0 32,32 0,32" fill="#ff0000"/>
        </svg>
    `
});
```

## Performance Tips

### 1. Optimal Column Count

| Video Duration | Recommended Columns | Seconds/Cell |
|----------------|---------------------|--------------|
| < 5 minutes | 4-5 | 5-10 |
| 5-30 minutes | 5-6 | 15-30 |
| 30-60 minutes | 6-8 | 30-60 |
| > 60 minutes | 8-10 | 60-120 |

### 2. LRU Cache

The library maintains an LRU cache of 200 frames by default. Increase for longer videos:

```javascript
VAMSeek.init({
    // ...
    cacheSize: 500 // For videos > 2 hours
});
```

### 3. Lazy Loading

For very long videos, consider loading frames on scroll:

```javascript
container.addEventListener('scroll', () => {
    // Trigger frame extraction for visible cells
    instance.rebuild();
});
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 80+ | Full |
| Firefox 75+ | Full |
| Safari 14+ | Full |
| Edge 80+ | Full |
| Mobile Chrome | Full |
| Mobile Safari | Full |

## CORS Requirements

The video source must allow canvas extraction:

```
Access-Control-Allow-Origin: *
```

Or serve the video and page from the same origin.

## License

Free for personal, educational, and research use.
Commercial use requires a paid license. Contact: info@haasiy.jp

## Support

GitHub Issues: https://github.com/unhaya/vam-seek/issues
