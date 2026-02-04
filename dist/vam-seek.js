/**
 * VAM Seek - 2D Video Seek Marker Library
 *
 * @version 1.3.6
 * @license See LICENSE (CC BY-NC 4.0 based)
 * @author Susumu Takahashi (unhaya) - https://github.com/unhaya
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
    // Multi-Video LRU Cache Manager (up to 5 videos, max 500 frames per video)
    // ==========================================
    class MultiVideoCache {
        constructor(maxVideos = 5, maxFramesPerVideo = 500) {
            this.maxVideos = maxVideos;
            this.maxFramesPerVideo = maxFramesPerVideo;
            this.videoOrder = []; // LRU order
            this.caches = new Map(); // videoSrc -> FrameCache (Map)
            this.frameOrder = new Map(); // videoSrc -> Array of timestamp keys (LRU order)
        }

        _getOrCreateCache(videoSrc) {
            if (!this.caches.has(videoSrc)) {
                // Evict oldest video if at capacity
                if (this.videoOrder.length >= this.maxVideos) {
                    const oldest = this.videoOrder.shift();
                    // Revoke all blob URLs for evicted video
                    const oldCache = this.caches.get(oldest);
                    if (oldCache) {
                        for (const frame of oldCache.values()) {
                            if (frame && frame.blobUrl) {
                                URL.revokeObjectURL(frame.blobUrl);
                            }
                        }
                    }
                    this.caches.delete(oldest);
                    this.frameOrder.delete(oldest);
                }
                this.caches.set(videoSrc, new Map());
                this.frameOrder.set(videoSrc, []);
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
            return cache.get(key) || null;
        }

        put(videoSrc, timestamp, imageData) {
            const cache = this._getOrCreateCache(videoSrc);
            const key = timestamp.toFixed(2);
            const order = this.frameOrder.get(videoSrc);

            if (cache.has(key)) {
                // Revoke old blob URL before replacing
                const old = cache.get(key);
                if (old && old.blobUrl) {
                    URL.revokeObjectURL(old.blobUrl);
                }
                // Move key to end of order (most recently used)
                const idx = order.indexOf(key);
                if (idx !== -1) {
                    order.splice(idx, 1);
                }
            } else {
                // Evict oldest frames if at capacity
                while (order.length >= this.maxFramesPerVideo) {
                    const oldestKey = order.shift();
                    const oldFrame = cache.get(oldestKey);
                    if (oldFrame && oldFrame.blobUrl) {
                        URL.revokeObjectURL(oldFrame.blobUrl);
                    }
                    cache.delete(oldestKey);
                }
            }

            cache.set(key, imageData);
            order.push(key);
        }

        hasVideo(videoSrc) {
            return this.caches.has(videoSrc);
        }

        getVideoCache(videoSrc) {
            return this.caches.get(videoSrc);
        }

        clear() {
            // Revoke all blob URLs before clearing
            for (const cache of this.caches.values()) {
                for (const frame of cache.values()) {
                    if (frame && frame.blobUrl) {
                        URL.revokeObjectURL(frame.blobUrl);
                    }
                }
            }
            this.caches.clear();
            this.frameOrder.clear();
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

    // Global shared cache for all instances (5 videos, unlimited frames)
    const globalCache = new MultiVideoCache(5);

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

            // Reusable canvas for frame capture (performance optimization)
            this._captureCanvas = document.createElement('canvas');
            this._captureCanvas.width = this.thumbWidth;
            this._captureCanvas.height = this.thumbHeight;
            this._captureCtx = this._captureCanvas.getContext('2d');

            // Parallel extraction settings (default 1 for sequential processing)
            this.parallelExtractors = options.parallelExtractors || 1;

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
                currentCellX: 0,  // Current cell column (for keyboard navigation)
                currentCellY: 0,  // Current cell row (for keyboard navigation)
                isDragging: false,
                isAnimating: false,
                animationId: null,
                extractorVideos: [],  // Array of parallel extractor videos
                currentTaskId: 0,  // Task counter (always increments)
                activeTaskId: null,  // Currently valid task ID (null = no active task)
                currentVideoUrl: null,  // Current video URL (like demo's STATE.currentVideoUrl)
                rebuildTimeoutId: null,  // Debounce for rebuild
                lastScrollTime: 0,
                scrollAnimationId: null,
                positionTimerId: null  // Independent position update timer (v1.3.1)
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
                // Default marker (VAM 5.70 style - red circle with play icon)
                this.marker.innerHTML = `
                    <svg width="40" height="40" viewBox="0 0 155.91 155.91">
                        <defs>
                            <style>
                                .vam-marker-circle { fill: #b7392b; stroke: #fff; stroke-miterlimit: 10; stroke-width: 8px; }
                                .vam-marker-play { fill: #fff; }
                            </style>
                        </defs>
                        <circle class="vam-marker-circle" cx="77.95" cy="77.95" r="63.49"/>
                        <path class="vam-marker-play" d="M66.6,109.32c-5.24,3.39-9.52,1.05-9.52-5.18v-52.38c0-6.24,4.28-8.57,9.52-5.18l38.99,25.21c5.24,3.39,5.24,8.93,0,12.31l-38.99,25.21Z"/>
                    </svg>
                `;
            }
            this.marker.style.display = 'none';
            this.grid.style.position = 'relative';
            this.grid.appendChild(this.marker);
        }

        _bindEvents() {
            // Store bound event handlers for cleanup in destroy()
            this._boundHandlers = {
                onTimeUpdate: () => this._onTimeUpdateForScroll(),
                onLoadedMetadata: () => this.rebuild(),
                onMouseDown: (e) => this._onMouseDown(e),
                onMouseMove: (e) => this._onMouseMove(e),
                onMouseUp: () => this._onMouseUp(),
                onTouchStart: (e) => {
                    e.preventDefault();
                    this.state.isDragging = true;
                    this._handleMousePosition(e.touches[0]);
                },
                onTouchMove: (e) => {
                    if (this.state.isDragging) {
                        e.preventDefault();
                        this._handleMousePosition(e.touches[0]);
                    }
                },
                onTouchEnd: () => {
                    if (this.state.isDragging) {
                        this.state.isDragging = false;
                        this._scrollToMarker();
                    }
                },
                onKeyDown: (e) => this._onKeyDown(e)
            };

            // Video time update - now only handles auto-scroll (v1.3.1)
            this.video.addEventListener('timeupdate', this._boundHandlers.onTimeUpdate);
            this.video.addEventListener('loadedmetadata', this._boundHandlers.onLoadedMetadata);

            // Independent position timer (16ms = ~60fps) - bypasses timeupdate irregularity (v1.3.1)
            this._startPositionTimer();

            // Grid interactions - Mouse
            this.grid.addEventListener('mousedown', this._boundHandlers.onMouseDown);
            document.addEventListener('mousemove', this._boundHandlers.onMouseMove);
            document.addEventListener('mouseup', this._boundHandlers.onMouseUp);

            // Grid interactions - Touch (same as demo)
            this.grid.addEventListener('touchstart', this._boundHandlers.onTouchStart, { passive: false });
            this.grid.addEventListener('touchmove', this._boundHandlers.onTouchMove, { passive: false });
            this.grid.addEventListener('touchend', this._boundHandlers.onTouchEnd);

            // Keyboard
            document.addEventListener('keydown', this._boundHandlers.onKeyDown);

            // Resize observer - update grid dimensions when container size changes
            this.resizeObserver = new ResizeObserver(() => {
                if (this.grid && this.state.totalCells > 0) {
                    this._updateGridDimensions();
                }
            });
            this.resizeObserver.observe(this.container);
        }

        // ==========================================
        // Public API
        // ==========================================

        /**
         * Rebuild the grid with current settings
         */
        rebuild() {
            if (!this.video.duration) return;

            // Cancel any ongoing scroll animation to prevent old grid's scroll affecting new grid
            if (this.state.scrollAnimationId) {
                cancelAnimationFrame(this.state.scrollAnimationId);
                this.state.scrollAnimationId = null;
            }

            // Cancel any ongoing marker animation
            if (this.state.animationId) {
                cancelAnimationFrame(this.state.animationId);
                this.state.animationId = null;
                this.state.isAnimating = false;
            }

            // Abort any ongoing extraction (like demo's generateThumbnails)
            this.state.activeTaskId = null;

            // Immediately cleanup extractor videos to prevent race conditions
            this._cleanupExtractorVideos();

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
            // Handle column overflow/underflow (wrap to next/previous row)
            if (col >= this.columns) {
                row += Math.floor(col / this.columns);
                col = col % this.columns;
            } else if (col < 0) {
                // Going left from col 0 should go to previous row's last column
                while (col < 0 && row > 0) {
                    row--;
                    col += this.columns;
                }
                col = Math.max(0, col);
            }

            col = Math.max(0, col);
            row = Math.max(0, row);

            const cellIndex = row * this.columns + col;
            const lastIndex = this.state.totalCells - 1;

            if (cellIndex > lastIndex) {
                row = Math.floor(lastIndex / this.columns);
                col = lastIndex % this.columns;
            }

            // Update internal cell state (for keyboard navigation)
            this.state.currentCellX = col;
            this.state.currentCellY = row;

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
         * Set scroll behavior mode safely (cancels ongoing animations)
         * @param {string} mode - 'center', 'edge', or 'off'
         */
        setScrollMode(mode) {
            // Cancel any ongoing scroll animation to prevent position conflicts
            if (this.state.scrollAnimationId) {
                cancelAnimationFrame(this.state.scrollAnimationId);
                this.state.scrollAnimationId = null;
            }

            // Reset scroll throttle timer to prevent immediate re-trigger
            this.state.lastScrollTime = Date.now();

            if (mode === 'off') {
                this.autoScroll = false;
            } else {
                this.scrollBehavior = mode;
                this.autoScroll = true;
            }
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
            // Stop position timer (v1.3.1)
            this._stopPositionTimer();
            // Cleanup all extractor videos
            this._cleanupExtractorVideos();
            // Disconnect resize observer
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }

            // Remove all event listeners (v1.3.4 - fix video switch oscillation)
            if (this._boundHandlers) {
                this.video.removeEventListener('timeupdate', this._boundHandlers.onTimeUpdate);
                this.video.removeEventListener('loadedmetadata', this._boundHandlers.onLoadedMetadata);
                document.removeEventListener('mousemove', this._boundHandlers.onMouseMove);
                document.removeEventListener('mouseup', this._boundHandlers.onMouseUp);
                document.removeEventListener('keydown', this._boundHandlers.onKeyDown);
                // Grid event listeners are removed when grid is removed from DOM
                this._boundHandlers = null;
            }

            // Don't clear global cache on destroy
            this.grid.remove();
            this.marker.remove();
        }

        /**
         * Cleanup all extractor videos
         */
        _cleanupExtractorVideos() {
            for (const video of this.state.extractorVideos) {
                if (video) {
                    video.pause();
                    video.src = '';
                    video.remove();
                }
            }
            this.state.extractorVideos = [];
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
                // Hold old extractor videos for delayed cleanup
                const oldExtractorVideos = [...this.state.extractorVideos];
                this.state.extractorVideos = [];

                // Check if task was cancelled
                if (!isTaskValid()) return;

                // Create parallel extractor videos (before cleanup for faster start)
                const extractorPromises = [];
                for (let i = 0; i < this.parallelExtractors; i++) {
                    extractorPromises.push(this._createExtractorVideo(targetVideoUrl));
                }

                const extractorVideos = await Promise.all(extractorPromises);

                // Delayed cleanup of old extractor videos (after new videos are created)
                if (oldExtractorVideos.length > 0) {
                    setTimeout(() => {
                        for (const video of oldExtractorVideos) {
                            if (video) {
                                video.pause();
                                video.src = '';
                                video.remove();
                            }
                        }
                    }, 0);
                }

                // Check if task was cancelled during video creation
                if (!isTaskValid()) {
                    for (const video of extractorVideos) {
                        if (video) {
                            video.pause();
                            video.src = '';
                            video.remove();
                        }
                    }
                    return;
                }

                // Only assign to state if task is still valid
                this.state.extractorVideos = extractorVideos.filter(v => v != null);

                if (this.state.extractorVideos.length === 0) return;

                // Get cells (exclude marker element)
                const cells = this.grid.querySelectorAll('.vam-cell');

                // === VIEWPORT-FIRST EXTRACTION ===
                // Phase 1: Extract visible cells first (user sees results immediately)
                // Phase 2: Extract remaining cells in background

                const visibleIndices = this._getVisibleCellIndices();
                const allIndices = Array.from({ length: this.state.totalCells }, (_, i) => i);
                const remainingIndices = allIndices.filter(i => !visibleIndices.includes(i));

                // Phase 1: Visible cells with all extractors
                if (visibleIndices.length > 0 && isTaskValid()) {
                    await this._extractCellsByIndices(
                        this.state.extractorVideos,
                        visibleIndices,
                        cells,
                        targetVideoUrl,
                        isTaskValid
                    );
                }

                // Phase 2: Remaining cells in background
                if (remainingIndices.length > 0 && isTaskValid()) {
                    await this._extractCellsByIndices(
                        this.state.extractorVideos,
                        remainingIndices,
                        cells,
                        targetVideoUrl,
                        isTaskValid
                    );
                }

            } catch (e) {
                // Frame extraction error - call onError callback if provided
                if (this.onError) {
                    this.onError({ type: 'extraction', error: e, message: 'Frame extraction failed' });
                }
            }
        }

        /**
         * Get indices of cells currently visible in viewport
         */
        _getVisibleCellIndices() {
            const containerRect = this.container.getBoundingClientRect();
            const scrollTop = this.container.scrollTop;
            const viewportTop = scrollTop;
            const viewportBottom = scrollTop + containerRect.height;

            const cellHeight = this.state.cellHeight + (this.state.gridGap || 2);
            const startRow = Math.floor(viewportTop / cellHeight);
            const endRow = Math.ceil(viewportBottom / cellHeight);

            const indices = [];
            for (let row = startRow; row <= endRow && row < this.state.rows; row++) {
                for (let col = 0; col < this.columns; col++) {
                    const index = row * this.columns + col;
                    if (index < this.state.totalCells) {
                        indices.push(index);
                    }
                }
            }
            return indices;
        }

        /**
         * Extract specific cells by indices using parallel extractors
         */
        async _extractCellsByIndices(extractorVideos, indices, cells, targetVideoUrl, isTaskValid) {
            const numExtractors = extractorVideos.length;
            const indicesPerExtractor = Math.ceil(indices.length / numExtractors);

            const tasks = extractorVideos.map((extractorVideo, extractorIndex) => {
                const startIdx = extractorIndex * indicesPerExtractor;
                const endIdx = Math.min(startIdx + indicesPerExtractor, indices.length);
                const myIndices = indices.slice(startIdx, endIdx);

                return this._extractFramesByIndices(
                    extractorVideo,
                    myIndices,
                    cells,
                    targetVideoUrl,
                    isTaskValid
                );
            });

            await Promise.all(tasks);
        }

        /**
         * Extract frames for specific cell indices
         */
        async _extractFramesByIndices(extractorVideo, indices, cells, targetVideoUrl, isTaskValid) {
            for (const i of indices) {
                if (!isTaskValid()) break;

                const timestamp = (i + 0.5) * this.secondsPerCell;
                const cell = cells[i];
                if (!cell) continue;

                // Check cache
                const cached = this.frameCache.get(targetVideoUrl, timestamp);
                if (cached) {
                    this._displayFrame(cell, cached);
                    continue;
                }

                if (!extractorVideo || !isTaskValid()) break;

                const frame = await this._extractFrame(extractorVideo, timestamp);

                if (!isTaskValid()) break;

                if (frame) {
                    this.frameCache.put(targetVideoUrl, timestamp, frame);
                    this._displayFrame(cell, frame);
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

        async _extractFrame(video, timestamp) {
            // Already at the requested position
            if (Math.abs(video.currentTime - timestamp) < 0.1 && video.readyState >= 2) {
                return await this._captureFrame(video);
            }

            return new Promise((resolve) => {
                let resolved = false;

                const onSeeked = async () => {
                    if (resolved) return;
                    resolved = true;
                    video.removeEventListener('seeked', onSeeked);
                    // Capture immediately - frame is already rendered when seeked fires
                    const frame = await this._captureFrame(video);
                    resolve(frame);
                };

                video.addEventListener('seeked', onSeeked);
                video.currentTime = Math.min(timestamp, video.duration - 0.1);

                // Timeout: 5 seconds
                setTimeout(async () => {
                    if (resolved) return;
                    resolved = true;
                    video.removeEventListener('seeked', onSeeked);
                    // Try to capture anyway
                    const frame = await this._captureFrame(video);
                    resolve(frame);
                }, 5000);
            });
        }

        _captureFrame(video) {
            if (video.readyState < 2) return Promise.resolve(null);

            return new Promise((resolve) => {
                try {
                    // Reuse canvas (performance optimization - no new canvas allocation)
                    this._captureCtx.drawImage(video, 0, 0, this.thumbWidth, this.thumbHeight);

                    // Use toBlob instead of toDataURL (faster, less memory)
                    this._captureCanvas.toBlob((blob) => {
                        if (blob) {
                            const blobUrl = URL.createObjectURL(blob);
                            resolve({
                                blobUrl: blobUrl,
                                width: this.thumbWidth,
                                height: this.thumbHeight
                            });
                        } else {
                            resolve(null);
                        }
                    }, 'image/jpeg', 0.8);
                } catch (e) {
                    resolve(null);
                }
            });
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
            // Support both blobUrl (new) and dataUrl (old cache)
            img.src = frame.blobUrl || frame.dataUrl;
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
            // Initialize internal cell state
            this.state.currentCellX = 0;
            this.state.currentCellY = 0;
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
            // Use markerY (current animated position) for smooth scroll tracking
            const markerY = this.state.markerY;

            if (this.scrollBehavior === 'edge') {
                // Edge-trigger: only scroll when marker reaches screen edge
                const scrollTop = this.container.scrollTop;
                if (markerY < scrollTop + 50) {
                    this._smoothScrollTo(Math.max(0, markerY - 100));
                } else if (markerY > scrollTop + viewportHeight - 50) {
                    this._smoothScrollTo(markerY - viewportHeight + 100);
                }
            } else {
                // Center-following (default): marker stays at viewport center
                const targetScroll = Math.max(0, markerY - viewportHeight / 2);
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

            // Calculate continuous cell index from time
            const continuousCellIndex = Math.min(time / this.secondsPerCell, this.state.totalCells - 0.001);

            // Calculate row (integer part of cellIndex / columns)
            const row = Math.floor(continuousCellIndex / this.columns);

            // Calculate position within the row
            const positionInRow = continuousCellIndex - (row * this.columns);
            const col = Math.floor(positionInRow);
            const colFraction = positionInRow - col;

            // X position: cell start + fraction within cell (continuous X movement)
            const x = col * (this.state.cellWidth + gap) + colFraction * this.state.cellWidth;

            // Y position: fixed at row center (no vertical fraction - stays on row line)
            const y = row * (this.state.cellHeight + gap) + this.state.cellHeight / 2;

            return {
                x: Math.max(0, Math.min(x, this.state.gridWidth)),
                y: Math.max(this.state.cellHeight / 2, y)
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
        // Independent Position Timer (v1.3.1)
        // Bypasses timeupdate event irregularity for smooth marker movement
        // ==========================================

        _startPositionTimer() {
            // Clear any existing timer
            this._stopPositionTimer();

            // 16ms interval = ~60fps - independent of timeupdate events
            this.state.positionTimerId = setInterval(() => {
                // Only update when video is playing and not dragging
                if (!this.video.paused && !this.state.isDragging && this.state.totalCells > 0) {
                    const pos = this._calculatePositionFromTime(this.video.currentTime);
                    this._moveMarkerTo(pos.x, pos.y, true);
                    // Sync internal cell state during playback
                    const gap = this.state.gridGap || 2;
                    const cellPlusGapX = this.state.cellWidth + gap;
                    const cellPlusGapY = this.state.cellHeight + gap;
                    this.state.currentCellX = Math.max(0, Math.min(Math.floor(pos.x / cellPlusGapX), this.columns - 1));
                    this.state.currentCellY = Math.max(0, Math.min(Math.floor(pos.y / cellPlusGapY), this.state.rows - 1));
                }
            }, 16);
        }

        _stopPositionTimer() {
            if (this.state.positionTimerId) {
                clearInterval(this.state.positionTimerId);
                this.state.positionTimerId = null;
            }
        }

        // ==========================================
        // Event Handlers
        // ==========================================

        /**
         * TimeUpdate handler - now only handles auto-scroll (v1.3.1)
         * Marker position updates are handled by independent timer
         */
        _onTimeUpdateForScroll() {
            if (this.state.isDragging) return;

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
                // Snap marker Y position to cell center (keep X position as is)
                const gap = this.state.gridGap || 2;
                const cellPlusGapX = this.state.cellWidth + gap;
                const cellPlusGapY = this.state.cellHeight + gap;
                const xAdjusted = this.state.markerX - this.state.cellWidth / 2;
                const yAdjusted = this.state.markerY - this.state.cellHeight / 2;
                const col = Math.max(0, Math.min(Math.round(xAdjusted / cellPlusGapX), this.columns - 1));
                const row = Math.max(0, Math.min(Math.round(yAdjusted / cellPlusGapY), this.state.rows - 1));
                const snappedY = row * cellPlusGapY + this.state.cellHeight / 2;
                this._moveMarkerTo(this.state.markerX, snappedY, true);
                // Update internal cell state
                this.state.currentCellX = col;
                this.state.currentCellY = row;
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

            // Use internal state instead of getCurrentCell() to avoid video.currentTime sync issues
            let col = this.state.currentCellX;
            let row = this.state.currentCellY;

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
        version: '1.3.6'
    };

})(typeof window !== 'undefined' ? window : this);
