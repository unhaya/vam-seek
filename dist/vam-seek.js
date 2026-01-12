/**
 * VAM Seek - 2D Video Seek Marker Library
 *
 * @version 1.0.0
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
 *       secondsPerCell: 15
 *     });
 *   </script>
 */

(function(global) {
    'use strict';

    // ==========================================
    // LRU Frame Cache
    // ==========================================
    class FrameCache {
        constructor(maxSize = 200) {
            this.cache = new Map();
            this.maxSize = maxSize;
        }

        _key(videoSrc, timestamp) {
            return `${videoSrc}@${timestamp.toFixed(2)}`;
        }

        get(videoSrc, timestamp) {
            const key = this._key(videoSrc, timestamp);
            if (!this.cache.has(key)) return null;
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        put(videoSrc, timestamp, imageData) {
            const key = this._key(videoSrc, timestamp);
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(key, imageData);
        }

        clear() {
            this.cache.clear();
        }

        get size() {
            return this.cache.size;
        }
    }

    // ==========================================
    // VAM Seek Main Class
    // ==========================================
    class VAMSeekInstance {
        constructor(options) {
            this.video = options.video;
            this.container = options.container;
            this.columns = options.columns || 5;
            this.secondsPerCell = options.secondsPerCell || 15;
            this.thumbWidth = options.thumbWidth || 160;
            this.thumbHeight = options.thumbHeight || 90;
            this.markerSvg = options.markerSvg || null;
            this.onSeek = options.onSeek || null;
            this.onCellClick = options.onCellClick || null;

            this.frameCache = new FrameCache(options.cacheSize || 200);
            this.state = {
                rows: 0,
                totalCells: 0,
                gridWidth: 0,
                gridHeight: 0,
                cellWidth: 0,
                cellHeight: 0,
                markerX: 0,
                markerY: 0,
                targetX: 0,
                targetY: 0,
                isDragging: false,
                isAnimating: false,
                animationId: null,
                extractorVideo: null,
                isExtracting: false,
                aborted: false
            };

            this.grid = null;
            this.marker = null;
            this._init();
        }

        _init() {
            this._createGrid();
            this._createMarker();
            this._bindEvents();
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
            this.container.style.position = 'relative';
            this.container.appendChild(this.marker);
        }

        _bindEvents() {
            // Video time update
            this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => this.rebuild());

            // Grid interactions
            this.grid.addEventListener('mousedown', (e) => this._onMouseDown(e));
            document.addEventListener('mousemove', (e) => this._onMouseMove(e));
            document.addEventListener('mouseup', () => this._onMouseUp());

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

            this.state.aborted = true;

            // ① Clear frame cache for new video (keep only current video's cache)
            this.frameCache.clear();

            this._calculateGridSize();
            this._renderGrid();
            this._updateGridDimensions();
            this._initMarker();

            // ② Reset scroll position to top
            this.container.scrollTop = 0;

            this._extractAllFrames();
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
         * Move marker to cell
         */
        moveToCell(col, row) {
            col = Math.max(0, Math.min(col, this.columns - 1));
            row = Math.max(0, Math.min(row, this.state.rows - 1));

            const cellIndex = row * this.columns + col;
            if (cellIndex >= this.state.totalCells) return;

            // Move marker to cell center
            const x = (col + 0.5) * this.state.cellWidth;
            const y = (row + 0.5) * this.state.cellHeight;
            this._moveMarkerTo(x, y, true);

            // Seek to cell center time (0.5 cell offset)
            const time = (cellIndex + 0.5) * this.secondsPerCell;
            this.seekTo(time);
        }

        /**
         * Destroy instance
         */
        destroy() {
            this.state.aborted = true;
            if (this.state.animationId) {
                cancelAnimationFrame(this.state.animationId);
            }
            if (this.state.extractorVideo) {
                this.state.extractorVideo.remove();
            }
            this.frameCache.clear();
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
        }

        _updateGridDimensions() {
            const rect = this.grid.getBoundingClientRect();
            this.state.gridWidth = rect.width;
            this.state.gridHeight = rect.height;
            this.state.cellWidth = rect.width / this.columns;
            this.state.cellHeight = rect.height / this.state.rows;
        }

        // ==========================================
        // Frame Extraction
        // ==========================================

        async _extractAllFrames() {
            if (this.state.isExtracting) return;

            this.state.isExtracting = true;
            this.state.aborted = false;

            try {
                // Create extractor video
                if (this.state.extractorVideo) {
                    this.state.extractorVideo.remove();
                }
                this.state.extractorVideo = await this._createExtractorVideo();

                for (let i = 0; i < this.state.totalCells; i++) {
                    if (this.state.aborted) break;

                    const timestamp = i * this.secondsPerCell;
                    const cell = this.grid.children[i];
                    if (!cell) continue;

                    const cached = this.frameCache.get(this.video.src, timestamp);
                    if (cached) {
                        this._displayFrame(cell, cached);
                        continue;
                    }

                    const frame = await this._extractFrame(timestamp);
                    if (frame && !this.state.aborted) {
                        this._displayFrame(cell, frame);
                    }

                    await new Promise(r => setTimeout(r, 5));
                }
            } catch (e) {
                console.error('VAMSeek: Frame extraction error', e);
            } finally {
                this.state.isExtracting = false;
            }
        }

        _createExtractorVideo() {
            return new Promise((resolve, reject) => {
                const video = document.createElement('video');
                video.style.display = 'none';
                video.muted = true;
                video.preload = 'auto';
                video.src = this.video.src;

                video.addEventListener('loadeddata', () => resolve(video));
                video.addEventListener('error', reject);

                document.body.appendChild(video);
            });
        }

        async _extractFrame(timestamp) {
            const video = this.state.extractorVideo;
            if (!video) return null;

            return new Promise((resolve) => {
                const cached = this.frameCache.get(this.video.src, timestamp);
                if (cached) {
                    resolve(cached);
                    return;
                }

                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    const frame = this._captureFrame(video);
                    if (frame) {
                        this.frameCache.put(this.video.src, timestamp, frame);
                    }
                    resolve(frame);
                };

                video.addEventListener('seeked', onSeeked);
                video.currentTime = timestamp;

                setTimeout(() => {
                    video.removeEventListener('seeked', onSeeked);
                    resolve(null);
                }, 3000);
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
                console.error('VAMSeek: Capture error', e);
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
            // Initialize marker at the center of first cell
            this.state.markerX = this.state.cellWidth * 0.5;
            this.state.markerY = this.state.cellHeight * 0.5;
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

        /**
         * Calculate marker position from playback time
         * VAM Algorithm: calculate_position_from_playback
         */
        _calculatePositionFromTime(time) {
            if (this.state.totalCells === 0 || this.secondsPerCell <= 0) {
                // Fallback: return center of first cell
                return {
                    x: this.state.cellWidth * 0.5,
                    y: this.state.cellHeight * 0.5
                };
            }

            const continuousCellIndex = time / this.secondsPerCell;
            let row = Math.floor(continuousCellIndex / this.columns);
            row = Math.max(0, Math.min(row, this.state.rows - 1));

            // positionInRow is the column index (0 to columns-1 range, can be fractional)
            const positionInRow = continuousCellIndex - (row * this.columns);
            // Convert to pixel position: (column_index + 0.5) * cellWidth (center of cell)
            const x = (positionInRow + 0.5) * this.state.cellWidth;
            const y = (row + 0.5) * this.state.cellHeight;

            return {
                x: Math.max(0, Math.min(x, this.state.gridWidth)),
                y: Math.max(this.state.cellHeight / 2, Math.min(y, this.state.gridHeight - this.state.cellHeight / 2))
            };
        }

        /**
         * Calculate timestamp from marker position
         * VAM Algorithm: calculate_x_continuous_timestamp
         */
        _calculateTimeFromPosition(x, y) {
            const relX = x / this.state.gridWidth;
            const relY = y / this.state.gridHeight;

            const rowIndex = Math.floor(relY * this.state.rows);
            const colContinuous = relX * this.columns;
            const continuousCellIndex = rowIndex * this.columns + colContinuous;
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
            }
        }

        _handleMousePosition(e) {
            const rect = this.grid.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top + this.container.scrollTop;

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
         * @param {number} [options.cacheSize=200] - LRU cache size
         * @param {string} [options.markerSvg] - Custom marker SVG
         * @param {Function} [options.onSeek] - Callback on seek
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
        version: '1.0.0'
    };

})(typeof window !== 'undefined' ? window : this);
