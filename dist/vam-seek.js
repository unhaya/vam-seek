/**
 * VAM Seek - 2D Video Seek Marker Library
 *
 * @version 1.2.3
 * @license MIT
 * @author VAM Project
 *
 * Usage:
 *   <script src="https://your-domain.com/vam-seek.js"></script>
 *   <script>
 *     VAMSeek.init({
 *       video: document.getElementById('myVideo'),
 *       container: document.getElementById('gridContainer'),
 *       columns: 5,
 *       secondsPerCell: 15,
 *       onError: (err) => console.error('VAMSeek error:', err)
 *     });
 *   </script>
 */

(function(global) {
    'use strict';

    // ==========================================
    // Multi-Video LRU Cache Manager (up to 3 videos)
    // ==========================================
    class MultiVideoCache {
        constructor(maxVideos = 3, framesPerVideo = 200) {
            this.maxVideos = maxVideos;
            this.framesPerVideo = framesPerVideo;
            this.videoOrder = []; // LRU order
            this.caches = new Map(); // videoSrc -> FrameCache
        }

        _getOrCreateCache(videoSrc) {
            if (!this.caches.has(videoSrc)) {
                // Evict oldest video if at capacity
                if (this.videoOrder.length >= this.maxVideos) {
                    const oldest = this.videoOrder.shift();
                    this.caches.delete(oldest);
                }
                this.caches.set(videoSrc, new Map());
                this.videoOrder.push(videoSrc);
            } else {
                // Move to end (most recently used)
                const idx = this.videoOrder.indexOf(videoSrc);
                if (idx !== -1) {
                    this.videoOrder.splice(idx, 1);
                    this.videoOrder.push(videoSrc);
                }
            }
            return this.caches.get(videoSrc);
        }

        get(videoSrc, timestamp) {
            const cache = this.caches.get(videoSrc);
            if (!cache) return null;
            const key = timestamp.toFixed(2);
            if (!cache.has(key)) return null;
            // LRU: move to end
            const value = cache.get(key);
            cache.delete(key);
            cache.set(key, value);
            return value;
        }

        put(videoSrc, timestamp, imageData) {
            const cache = this._getOrCreateCache(videoSrc);
            const key = timestamp.toFixed(2);
            if (cache.has(key)) {
                cache.delete(key);
            } else if (cache.size >= this.framesPerVideo) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set(key, imageData);
        }

        hasVideo(videoSrc) {
            return this.caches.has(videoSrc);
        }

        getVideoCache(videoSrc) {
            return this.caches.get(videoSrc);
        }

        clear() {
            this.caches.clear();
            this.videoOrder = [];
        }

        get size() {
            let total = 0;
            for (const cache of this.caches.values()) {
                total += cache.size;
            }
            return total;
        }
    }

    // Global shared cache for all instances
    const globalCache = new MultiVideoCache(3, 200);

    // ==========================================
    // VAM Seek Main Class
    // ==========================================
    class VAMSeekInstance {
        constructor(options) {
            this.video = options.video;
            this.container = options.container;
            this.columns = options.columns || 3;
            this.secondsPerCell = options.secondsPerCell || 15;
            this.thumbWidth = options.thumbWidth || 160;
            this.thumbHeight = options.thumbHeight || 90;
            this.markerSvg = options.markerSvg || null;
            this.onSeek = options.onSeek || null;
            this.onCellClick = options.onCellClick || null;
            this.onError = options.onError || null;  // Error callback
            this.autoScroll = options.autoScroll !== false; // Default: true
            this.scrollBehavior = options.scrollBehavior || 'center'; // 'center' or 'edge'

            // Use global multi-video cache
            this.frameCache = globalCache;
            this.state = {
                rows: 0,
                totalCells: 0,
                gridWidth: 0,
                gridHeight: 0,
                cellWidth: 0,
                cellHeight: 0,
                gridGap: 2,  // Grid gap between cells
                markerX: 0,
                markerY: 0,
                targetX: 0,
                targetY: 0,
                isDragging: false,
                isAnimating: false,
                animationId: null,
                extractorVideo: null,
                currentTaskId: 0,  // Task counter (always increments)
                activeTaskId: null,  // Currently valid task ID (null = no active task)
                currentVideoUrl: null,  // Current video URL (like demo's STATE.currentVideoUrl)
                rebuildTimeoutId: null,  // Debounce for rebuild
                lastScrollTime: 0,
                scrollAnimationId: null
            };

            this.grid = null;
            this.marker = null;
            this._init();
        }

        _init() {
            this._createGrid();
            this._createMarker();
            this._bindEvents();

            // If video duration is already available, build grid immediately
            if (this.video.duration) {
                this.rebuild();
            }
        }

        _createGrid() {
            this.grid = document.createElement('div');
            this.grid.className = 'vam-thumbnail-grid';
            this.grid.style.cssText = `
                display: grid;
                gap: 2px;
                position: relative;
                user-select: none;
                -webkit-user-select: none;
            `;
            this.container.appendChild(this.grid);
        }

        _createMarker() {
            this.marker = document.createElement('div');
            this.marker.className = 'vam-marker';
            this.marker.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 100;
                transform: translate(-50%, -50%);
                transition: none;
            `;

            if (this.markerSvg) {
                this.marker.innerHTML = this.markerSvg;
            } else {
                // Default marker
                this.marker.innerHTML = `
                    <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="18" fill="none" stroke="#ff4444" stroke-width="3"/>
                        <circle cx="20" cy="20" r="4" fill="#ff4444"/>
                        <line x1="20" y1="2" x2="20" y2="12" stroke="#ff4444" stroke-width="2"/>
                        <line x1="20" y1="28" x2="20" y2="38" stroke="#ff4444" stroke-width="2"/>
                        <line x1="2" y1="20" x2="12" y2="20" stroke="#ff4444" stroke-width="2"/>
                        <line x1="28" y1="20" x2="38" y2="20" stroke="#ff4444" stroke-width="2"/>
                    </svg>
                `;
            }
            this.marker.style.display = 'none';
            this.grid.style.position = 'relative';
            this.grid.appendChild(this.marker);
        }

        _bindEvents() {
            // Video time update
            this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => this.rebuild());

            // Grid interactions - Mouse
            this.grid.addEventListener('mousedown', (e) => this._onMouseDown(e));
            document.addEventListener('mousemove', (e) => this._onMouseMove(e));
            document.addEventListener('mouseup', () => this._onMouseUp());

            // Grid interactions - Touch (same as demo)
            this.grid.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.state.isDragging = true;
                this._handleMousePosition(e.touches[0]);
            }, { passive: false });

            this.grid.addEventListener('touchmove', (e) => {
                if (this.state.isDragging) {
                    e.preventDefault();
                    this._handleMousePosition(e.touches[0]);
                }
            }, { passive: false });

            this.grid.addEventListener('touchend', () => {
                if (this.state.isDragging) {
                    this.state.isDragging = false;
                    this._scrollToMarker();
                }
            });

            // Keyboard
            document.addEventListener('keydown', (e) => this._onKeyDown(e));
        }

        // ==========================================
        // Public API
        // ==========================================

        /**
         * Rebuild the grid with current settings
         */
        rebuild() {
            if (!this.video.duration) return;

            // Abort any ongoing extraction (like demo's generateThumbnails)
            this.state.activeTaskId = null;

            // Immediately cleanup extractor video to prevent race conditions
            if (this.state.extractorVideo) {
                this.state.extractorVideo.pause();
                this.state.extractorVideo.src = '';
                this.state.extractorVideo.remove();
                this.state.extractorVideo = null;
            }

            // Store current video URL (like demo's STATE.currentVideoUrl)
            this.state.currentVideoUrl = this.video.src;

            // Set current video in LRU cache (like demo's frameCache.setCurrentVideo)
            // This ensures cache is properly initialized for the current video
            if (!this.frameCache.hasVideo(this.state.currentVideoUrl)) {
                this.frameCache._getOrCreateCache(this.state.currentVideoUrl);
            }

            this._calculateGridSize();
            this._renderGrid();

            // Reset scroll position to top
            this.container.scrollTop = 0;

            // Debounce: cancel any pending rebuild
            if (this.state.rebuildTimeoutId) {
                cancelAnimationFrame(this.state.rebuildTimeoutId);
            }

            // Update dimensions and start extraction in next frame
            // (like demo's requestAnimationFrame - ensures DOM is laid out)
            this.state.rebuildTimeoutId = requestAnimationFrame(() => {
                this.state.rebuildTimeoutId = null;
                this._updateGridDimensions();
                this._initMarker();
                this.container.scrollTop = 0;
                this._extractAllFrames();
            });
        }

        /**
         * Update configuration
         */
        configure(options) {
            if (options.columns !== undefined) this.columns = options.columns;
            if (options.secondsPerCell !== undefined) this.secondsPerCell = options.secondsPerCell;
            if (options.thumbWidth !== undefined) this.thumbWidth = options.thumbWidth;
            if (options.thumbHeight !== undefined) this.thumbHeight = options.thumbHeight;
            this.rebuild();
        }

        /**
         * Seek to specific time
         */
        seekTo(time) {
            this.video.currentTime = Math.max(0, Math.min(time, this.video.duration));
        }

        /**
         * Move marker to cell (same as demo)
         */
        moveToCell(col, row) {
            col = Math.max(0, col);
            row = Math.max(0, row);

            const cellIndex = row * this.columns + col;
            const lastIndex = this.state.totalCells - 1;

            if (cellIndex > lastIndex) {
                row = Math.floor(lastIndex / this.columns);
                col = lastIndex % this.columns;
            }

            // Calculate cell center position (gap-aware, same as demo)
            const gap = this.state.gridGap || 2;
            const x = col * this.state.cellWidth + col * gap + this.state.cellWidth / 2;  // Cell center X
            const y = row * this.state.cellHeight + row * gap + this.state.cellHeight / 2;  // Cell center Y
            this._moveMarkerTo(x, y, true);

            // Set time to cell center (add 0.5 cell) so marker stays centered after timeupdate
            const time = (row * this.columns + col + 0.5) * this.secondsPerCell;
            this.seekTo(Math.min(time, this.video.duration));

            // Auto-scroll to marker position
            this._scrollToMarker();
        }

        /**
         * Destroy instance
         */
        destroy() {
            // Invalidate current task to stop extraction
            this.state.activeTaskId = null;
            if (this.state.animationId) {
                cancelAnimationFrame(this.state.animationId);
            }
            if (this.state.scrollAnimationId) {
                cancelAnimationFrame(this.state.scrollAnimationId);
            }
            if (this.state.extractorVideo) {
                this.state.extractorVideo.pause();
                this.state.extractorVideo.src = '';
                this.state.extractorVideo.remove();
                this.state.extractorVideo = null;
            }
            // Don't clear global cache on destroy
            this.grid.remove();
            this.marker.remove();
        }

        /**
         * Get current cell info
         */
        getCurrentCell() {
            const time = this.video.currentTime;
            const cellIndex = Math.floor(time / this.secondsPerCell);
            return {
                index: cellIndex,
                col: cellIndex % this.columns,
                row: Math.floor(cellIndex / this.columns),
                time: time,
                cellStartTime: cellIndex * this.secondsPerCell,
                cellEndTime: (cellIndex + 1) * this.secondsPerCell
            };
        }

        // ==========================================
        // Grid Calculation (VAM Algorithm)
        // ==========================================

        _calculateGridSize() {
            const duration = this.video.duration;
            this.state.totalCells = Math.ceil(duration / this.secondsPerCell);
            this.state.rows = Math.ceil(this.state.totalCells / this.columns);
        }

        _renderGrid() {
            this.grid.innerHTML = '';
            this.grid.style.gridTemplateColumns = `repeat(${this.columns}, 1fr)`;

            for (let i = 0; i < this.state.totalCells; i++) {
                const cell = document.createElement('div');
                cell.className = 'vam-cell';
                cell.dataset.index = i;
                cell.style.cssText = `
                    aspect-ratio: 16/9;
                    background: #1a1a2e;
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                `;

                // Loading spinner
                const loader = document.createElement('div');
                loader.className = 'vam-loader';
                loader.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: vam-spin 1s linear infinite;
                `;
                cell.appendChild(loader);

                // Time label
                const time = i * this.secondsPerCell;
                const label = document.createElement('span');
                label.className = 'vam-time';
                label.textContent = this._formatTime(time);
                label.style.cssText = `
                    position: absolute;
                    bottom: 2px;
                    right: 2px;
                    background: rgba(0,0,0,0.7);
                    color: #fff;
                    padding: 1px 4px;
                    font-size: 9px;
                    border-radius: 2px;
                    pointer-events: none;
                `;
                cell.appendChild(label);

                this.grid.appendChild(cell);
            }

            // Add animation keyframes
            if (!document.getElementById('vam-styles')) {
                const style = document.createElement('style');
                style.id = 'vam-styles';
                style.textContent = `
                    @keyframes vam-spin {
                        to { transform: translate(-50%, -50%) rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }

            // Re-append marker to grid (it was removed by innerHTML = '')
            this.grid.appendChild(this.marker);
        }

        _updateGridDimensions() {
            const rect = this.grid.getBoundingClientRect();
            this.state.gridWidth = rect.width;
            this.state.gridHeight = rect.height;

            // Get actual cell dimensions from first cell (like demo)
            const firstCell = this.grid.querySelector('.vam-cell');
            if (firstCell) {
                const cellRect = firstCell.getBoundingClientRect();
                this.state.cellWidth = cellRect.width;
                this.state.cellHeight = cellRect.height;

                // Calculate gap from grid computed style
                const gridStyle = getComputedStyle(this.grid);
                this.state.gridGap = parseFloat(gridStyle.gap) || 2;
            } else {
                this.state.cellWidth = rect.width / this.columns;
                this.state.cellHeight = rect.height / this.state.rows;
                this.state.gridGap = 2;
            }
        }

        // ==========================================
        // Frame Extraction
        // ==========================================

        async _extractAllFrames() {
            if (!this.state.currentVideoUrl) return;

            // Task-based abort management (exactly like demo's extractAllFrames)
            const taskId = ++this.state.currentTaskId;
            this.state.activeTaskId = taskId;
            const targetVideoUrl = this.state.currentVideoUrl;

            // Helper to check if this task is still valid (exactly like demo)
            const isTaskValid = () => this.state.activeTaskId === taskId && this.state.currentVideoUrl === targetVideoUrl;

            try {
                // Cleanup previous extractor video
                if (this.state.extractorVideo) {
                    this.state.extractorVideo.pause();
                    this.state.extractorVideo.src = '';
                    this.state.extractorVideo.remove();
                    this.state.extractorVideo = null;
                }

                // Check if task was cancelled
                if (!isTaskValid()) return;

                // Create extractor video using local variable first
                // to prevent race condition when rebuild() is called during creation
                const extractorVideo = await this._createExtractorVideo(targetVideoUrl);

                // Check if task was cancelled during video creation
                if (!isTaskValid()) {
                    if (extractorVideo) {
                        extractorVideo.pause();
                        extractorVideo.src = '';
                        extractorVideo.remove();
                    }
                    return;
                }

                // Only assign to state if task is still valid
                this.state.extractorVideo = extractorVideo;

                if (!this.state.extractorVideo) return;

                // Get cells (exclude marker element)
                const cells = this.grid.querySelectorAll('.vam-cell');

                for (let i = 0; i < this.state.totalCells; i++) {
                    // Check if task was cancelled (cache is preserved)
                    if (!isTaskValid()) {
                        break;
                    }

                    // Extract thumbnail from center of cell (0.5 offset)
                    const timestamp = (i + 0.5) * this.secondsPerCell;
                    const cell = cells[i];
                    if (!cell) continue;

                    // Check cache
                    const cached = this.frameCache.get(targetVideoUrl, timestamp);
                    if (cached) {
                        this._displayFrame(cell, cached);
                        continue;
                    }

                    // Check extractorVideo still exists (may be cleaned up by rebuild)
                    if (!this.state.extractorVideo || !isTaskValid()) break;

                    const frame = await this._extractFrame(this.state.extractorVideo, timestamp);

                    // Check again after async operation
                    if (!isTaskValid()) break;

                    if (frame) {
                        this.frameCache.put(targetVideoUrl, timestamp, frame);
                        this._displayFrame(cell, frame);
                    }

                    await new Promise(r => setTimeout(r, 5));
                }
            } catch (e) {
                // Frame extraction error - call onError callback if provided
                if (this.onError) {
                    this.onError({ type: 'extraction', error: e, message: 'Frame extraction failed' });
                }
            }
        }

        _createExtractorVideo(url) {
            return new Promise((resolve, reject) => {
                const video = document.createElement('video');
                video.style.display = 'none';
                video.muted = true;
                video.playsInline = true;
                video.preload = 'auto';

                // Set crossOrigin only for external URLs (same as demo)
                if (url.startsWith('http') && !url.startsWith(location.origin)) {
                    video.crossOrigin = 'anonymous';
                }
                video.src = url;

                const onReady = () => {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('canplay', onReady);
                    resolve(video);
                };

                video.addEventListener('loadeddata', onReady);
                video.addEventListener('canplay', onReady);
                video.addEventListener('error', reject);

                // Timeout: 10 seconds (same as demo)
                setTimeout(() => {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('canplay', onReady);
                    if (video.readyState >= 2) {
                        resolve(video);
                    } else {
                        reject(new Error('Video load timeout'));
                    }
                }, 10000);

                document.body.appendChild(video);
                video.load();
            });
        }

        _extractFrame(video, timestamp) {
            return new Promise((resolve) => {
                // Already at the requested position
                if (Math.abs(video.currentTime - timestamp) < 0.1 && video.readyState >= 2) {
                    resolve(this._captureFrame(video));
                    return;
                }

                let resolved = false;

                const onSeeked = () => {
                    if (resolved) return;
                    resolved = true;
                    video.removeEventListener('seeked', onSeeked);
                    // Wait for frame to render
                    setTimeout(() => resolve(this._captureFrame(video)), 50);
                };

                video.addEventListener('seeked', onSeeked);
                video.currentTime = Math.min(timestamp, video.duration - 0.1);

                // Timeout: 5 seconds
                setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    video.removeEventListener('seeked', onSeeked);
                    // Try to capture anyway
                    resolve(this._captureFrame(video));
                }, 5000);
            });
        }

        _captureFrame(video) {
            if (video.readyState < 2) return null;

            try {
                const canvas = document.createElement('canvas');
                canvas.width = this.thumbWidth;
                canvas.height = this.thumbHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                return {
                    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
                    width: canvas.width,
                    height: canvas.height
                };
            } catch (e) {
                return null;
            }
        }

        _displayFrame(cell, frame) {
            const loader = cell.querySelector('.vam-loader');
            if (loader) loader.remove();

            const existing = cell.querySelector('img');
            if (existing) existing.remove();

            const img = new Image();
            img.onload = () => {
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.4s ease-in-out;
                `;
                cell.insertBefore(img, cell.firstChild);
                requestAnimationFrame(() => { img.style.opacity = '1'; });
            };
            img.src = frame.dataUrl;
        }

        // ==========================================
        // Marker Movement (VAM Algorithm)
        // ==========================================

        _initMarker() {
            this.marker.style.display = 'block';
            // Initialize at first cell center (same as demo)
            this.state.markerX = 0;
            this.state.markerY = this.state.cellHeight / 2;
            this.state.targetX = this.state.markerX;
            this.state.targetY = this.state.markerY;
            this._updateMarkerPosition();
        }

        _moveMarkerTo(x, y, animate = true) {
            this.state.targetX = Math.max(0, Math.min(x, this.state.gridWidth));
            this.state.targetY = Math.max(0, Math.min(y, this.state.gridHeight));

            if (animate && !this.state.isAnimating) {
                this.state.isAnimating = true;
                this._animateMarker();
            } else if (!animate) {
                this.state.markerX = this.state.targetX;
                this.state.markerY = this.state.targetY;
                this._updateMarkerPosition();
            }
        }

        _animateMarker() {
            const dx = this.state.targetX - this.state.markerX;
            const dy = this.state.targetY - this.state.markerY;

            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
                this.state.markerX = this.state.targetX;
                this.state.markerY = this.state.targetY;
                this.state.isAnimating = false;
                this._updateMarkerPosition();
                return;
            }

            const speed = 0.15;
            this.state.markerX += dx * speed;
            this.state.markerY += dy * speed;
            this._updateMarkerPosition();

            this.state.animationId = requestAnimationFrame(() => this._animateMarker());
        }

        _updateMarkerPosition() {
            this.marker.style.transform = `translate(${this.state.markerX}px, ${this.state.markerY}px) translate(-50%, -50%)`;
        }

        // ==========================================
        // Auto-Scroll (Center-Following with Smooth Animation)
        // ==========================================

        /**
         * Scroll container to keep marker visible
         * Uses center-following by default (VAM 5.70 style)
         */
        _scrollToMarker() {
            if (!this.autoScroll) return;

            const viewportHeight = this.container.clientHeight;

            if (this.scrollBehavior === 'edge') {
                // Edge-trigger: only scroll when marker reaches screen edge
                const scrollTop = this.container.scrollTop;
                if (this.state.markerY < scrollTop + 50) {
                    this._smoothScrollTo(Math.max(0, this.state.markerY - 100));
                } else if (this.state.markerY > scrollTop + viewportHeight - 50) {
                    this._smoothScrollTo(this.state.markerY - viewportHeight + 100);
                }
            } else {
                // Center-following (default): marker stays at viewport center
                const targetScroll = Math.max(0, this.state.markerY - viewportHeight / 2);
                this._smoothScrollTo(targetScroll);
            }
        }

        /**
         * Smooth scroll animation using requestAnimationFrame
         * 400ms duration with OutCubic easing (same as VAM 5.70)
         */
        _smoothScrollTo(targetScroll) {
            const start = this.container.scrollTop;
            const distance = targetScroll - start;

            // Skip if already at target
            if (Math.abs(distance) < 1) return;

            // Cancel any ongoing animation
            if (this.state.scrollAnimationId) {
                cancelAnimationFrame(this.state.scrollAnimationId);
            }

            const duration = 400; // 400ms like VAM 5.70
            let startTime = null;
            const container = this.container;
            const state = this.state;

            function animate(currentTime) {
                if (!startTime) startTime = currentTime;
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // OutCubic easing (same as VAM 5.70's QPropertyAnimation)
                const eased = 1 - Math.pow(1 - progress, 3);
                container.scrollTop = start + distance * eased;

                if (progress < 1) {
                    state.scrollAnimationId = requestAnimationFrame(animate);
                } else {
                    state.scrollAnimationId = null;
                }
            }

            this.state.scrollAnimationId = requestAnimationFrame(animate);
        }

        /**
         * Calculate marker position from playback time
         * (Same as demo: calculateMarkerPositionFromTime)
         */
        _calculatePositionFromTime(time) {
            if (this.state.totalCells === 0 || this.secondsPerCell <= 0) {
                return { x: 0, y: this.state.cellHeight / 2 };
            }

            const gap = this.state.gridGap || 2;
            const continuousCellIndex = time / this.secondsPerCell;
            let row = Math.floor(continuousCellIndex / this.columns);
            row = Math.max(0, Math.min(row, this.state.rows - 1));

            const positionInRow = continuousCellIndex - (row * this.columns);
            let col = Math.floor(positionInRow);
            col = Math.max(0, Math.min(col, this.columns - 1));
            const colFraction = Math.max(0, Math.min(positionInRow - col, 1));

            // X position: col cells + col gaps (gap only between cells, not after last)
            const x = col * this.state.cellWidth + col * gap + colFraction * this.state.cellWidth;

            // Y position: row cells + row gaps, centered in cell
            const y = row * this.state.cellHeight + row * gap + this.state.cellHeight / 2;

            return {
                x: Math.max(0, Math.min(x, this.state.gridWidth)),
                y: Math.max(this.state.cellHeight / 2, Math.min(y, this.state.gridHeight - this.state.cellHeight / 2))
            };
        }

        /**
         * Calculate timestamp from marker position
         * (Same as demo: calculateTimeFromPosition)
         */
        _calculateTimeFromPosition(x, y) {
            // Account for gap between cells
            const gap = this.state.gridGap || 2;
            const cellPlusGapY = this.state.cellHeight + gap;

            // Calculate row from Y - subtract half cell height to account for center offset
            const yAdjusted = y - this.state.cellHeight / 2;
            const rowContinuous = yAdjusted / cellPlusGapY;
            const row = Math.max(0, Math.min(Math.floor(rowContinuous + 0.5), this.state.rows - 1));

            // Calculate column from X (account for gap)
            const cellPlusGapX = this.state.cellWidth + gap;
            const colContinuous = x / cellPlusGapX;
            const col = Math.max(0, Math.min(Math.floor(colContinuous), this.columns - 1));
            const xInCol = x - col * cellPlusGapX;
            const colFraction = Math.max(0, Math.min(xInCol / this.state.cellWidth, 1));

            // Calculate continuous cell index
            const continuousCellIndex = row * this.columns + col + colFraction;
            const timestamp = continuousCellIndex * this.secondsPerCell;

            return Math.max(0, Math.min(timestamp, this.video.duration));
        }

        // ==========================================
        // Event Handlers
        // ==========================================

        _onTimeUpdate() {
            if (this.state.isDragging) return;

            const pos = this._calculatePositionFromTime(this.video.currentTime);
            this._moveMarkerTo(pos.x, pos.y, true);

            // Auto-scroll with throttling (500ms interval)
            if (this.autoScroll && !this.video.paused) {
                const now = Date.now();
                if (now - this.state.lastScrollTime > 500) {
                    this._scrollToMarker();
                    this.state.lastScrollTime = now;
                }
            }
        }

        _onMouseDown(e) {
            e.preventDefault();
            this.state.isDragging = true;
            this._handleMousePosition(e);
        }

        _onMouseMove(e) {
            if (!this.state.isDragging) return;
            this._handleMousePosition(e);
        }

        _onMouseUp() {
            if (this.state.isDragging) {
                this.state.isDragging = false;
                this._scrollToMarker();
            }
        }

        _handleMousePosition(e) {
            const rect = this.grid.getBoundingClientRect();
            // Same as demo: no scroll offset added (rect.top is already viewport relative)
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const clampedX = Math.max(0, Math.min(x, this.state.gridWidth));
            const clampedY = Math.max(0, Math.min(y, this.state.gridHeight));

            this._moveMarkerTo(clampedX, clampedY, false);

            const time = this._calculateTimeFromPosition(clampedX, clampedY);
            this.seekTo(time);

            if (this.onSeek) {
                this.onSeek(time, this.getCurrentCell());
            }
        }

        _onKeyDown(e) {
            if (!this.video.duration) return;

            const cell = this.getCurrentCell();
            let col = cell.col;
            let row = cell.row;

            switch (e.key) {
                case 'ArrowLeft':
                    col--;
                    break;
                case 'ArrowRight':
                    col++;
                    break;
                case 'ArrowUp':
                    row--;
                    break;
                case 'ArrowDown':
                    row++;
                    break;
                case 'Home':
                    col = 0;
                    row = 0;
                    break;
                case 'End':
                    const lastIndex = this.state.totalCells - 1;
                    col = lastIndex % this.columns;
                    row = Math.floor(lastIndex / this.columns);
                    break;
                case ' ':
                    e.preventDefault();
                    this.video.paused ? this.video.play() : this.video.pause();
                    return;
                default:
                    return;
            }

            e.preventDefault();
            this.moveToCell(col, row);
        }

        // ==========================================
        // Utilities
        // ==========================================

        _formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // ==========================================
    // Public API
    // ==========================================

    const instances = new Map();

    global.VAMSeek = {
        /**
         * Initialize VAM Seek on a video element
         *
         * @param {Object} options
         * @param {HTMLVideoElement} options.video - Target video element
         * @param {HTMLElement} options.container - Container for the grid
         * @param {number} [options.columns=5] - Number of columns
         * @param {number} [options.secondsPerCell=15] - Seconds per cell
         * @param {number} [options.thumbWidth=160] - Thumbnail width
         * @param {number} [options.thumbHeight=90] - Thumbnail height
         * @param {number} [options.cacheSize=200] - LRU cache size per video
         * @param {string} [options.markerSvg] - Custom marker SVG
         * @param {Function} [options.onSeek] - Callback on seek
         * @param {boolean} [options.autoScroll=true] - Enable auto-scroll during playback
         * @param {string} [options.scrollBehavior='center'] - Scroll behavior: 'center' or 'edge'
         * @returns {VAMSeekInstance}
         */
        init: function(options) {
            if (!options.video || !options.container) {
                throw new Error('VAMSeek: video and container are required');
            }

            const instance = new VAMSeekInstance(options);
            instances.set(options.video, instance);
            return instance;
        },

        /**
         * Get instance for a video element
         */
        getInstance: function(video) {
            return instances.get(video);
        },

        /**
         * Destroy instance
         */
        destroy: function(video) {
            const instance = instances.get(video);
            if (instance) {
                instance.destroy();
                instances.delete(video);
            }
        },

        /**
         * Library version
         */
        version: '1.2.3'
    };

})(typeof window !== 'undefined' ? window : this);
