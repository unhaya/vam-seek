===============================================
VAM Seek - Lolipop Server Deployment Guide
===============================================

DIRECTORY STRUCTURE
-------------------

Upload this folder to your Lolipop server:

lolipop/
  index.html    <- Main demo page (single file, ~30KB)
  README.txt    <- This file (optional)

DEPLOYMENT STEPS
----------------

1. Login to Lolipop control panel
2. Open FTP/File Manager
3. Upload index.html to your web directory
   - For subdomain: /public_html/
   - For subdirectory: /public_html/vam-seek/
4. Access via browser:
   - Subdomain: https://yoursite.lolipop.jp/
   - Subdirectory: https://yoursite.lolipop.jp/vam-seek/

REQUIREMENTS
------------

- No server-side processing required
- No PHP, Python, or database needed
- Works on any static hosting

FEATURES
--------

- 100% client-side video processing
- No file upload to server
- LRU cache for 200 frames
- Smooth 60fps marker animation
- Keyboard shortcuts supported
- Mobile responsive

BROWSER SUPPORT
---------------

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

TROUBLESHOOTING
---------------

Q: Video doesn't load?
A: Check if the video format is supported (MP4, WebM, MOV)

Q: Thumbnails not generating?
A: Some browsers block canvas access for cross-origin videos.
   Use local files only.

Q: Slow performance?
A: Large videos may take time for initial frame extraction.
   Frames are cached for subsequent seeks.

===============================================
VAM Seek - Zero Server CPU, Full Browser Power
===============================================
