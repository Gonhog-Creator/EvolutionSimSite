import { eventBus } from '../core/EventBus.js';
import { logger } from '../utils/logger.js';
import { selectionManager } from './SelectionManager.js';
import { temperatureManager } from '../managers/TemperatureManager.js';

/**
 * Manages the canvas and rendering operations
 */
export class CanvasManager {
  constructor() {
    // Canvas properties
    this.canvas = null;
    this.ctx = null;
    
    // State management
    this.isInitialized = false;
    this.isInitializing = false;
    this.isRunning = false;
    this.isPaused = false;
    this.needsRedraw = true;
    
    // Animation frame tracking
    this.animationFrameId = null;
    this.lastRenderTime = 0;
    this.lastFpsLog = 0;
    
    // Grid configuration - matching original implementation
    this.grid = {
      cellSize: 20,  // Size of each grid cell in pixels
      width: 0,      // Number of cells horizontally
      height: 0,     // Number of cells vertically
      cells: [],     // 2D array of cell data
      lineColor: '#1a1a1a',  // Grid line color
      backgroundColor: '#ffffff'  // White background
    };
    
    // UI State
    this.showTemperature = false;
    
    // Bind methods
    this.init = this.init.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.drawGrid = this.drawGrid.bind(this);
    this.initializeGrid = this.initializeGrid.bind(this);
    this.setupCanvas = this.setupCanvas.bind(this);
    
    // Debug information
    this._debug = {
      frameCount: 0,
      lastFrameTime: 0,
      fps: 0,
      showFps: false
    };
  }
  
  /**
   * Set up the canvas element and its context
   */
  setupCanvas() {
    // Get the existing canvas
    this.canvas = document.querySelector('canvas');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'canvas';
      document.body.appendChild(this.canvas);
    }
    
    // Make sure the canvas is visible
    this.canvas.style.display = 'block';
    this.canvas.style.visibility = 'visible';
    this.canvas.style.opacity = '1';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '1';
    
    // Set canvas styles
    this.canvas.style.backgroundColor = this.grid.backgroundColor;
    this.canvas.style.boxSizing = 'border-box';
    
    // Force a reflow to ensure styles are applied
    this.canvas.offsetHeight;
    
    // Get 2D context with alpha disabled for better performance
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    if (!this.ctx) {
      throw new Error('Could not get 2D context');
    }
    
    // Set default rendering settings
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.mozImageSmoothingEnabled = false;
    
    // Initialize selection manager
    if (selectionManager) {
      selectionManager.init(this.canvas, this.grid.cellSize);
      selectionManager.app = this; // Set app reference
    }
  }
  
  /**
   * Initialize the canvas
   */
  async init() {
    if (this.isInitialized || this.isInitializing) {
      logger.warn('CanvasManager already initialized or initializing');
      return;
    }
    
    this.isInitializing = true;
    
    // Show loading state
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.querySelector('.progress-fill');
    
    const updateProgress = (percent, message) => {
      if (loadingText) loadingText.textContent = message;
      if (progressBar) progressBar.style.width = `${percent}%`;
      const progressEl = document.getElementById('loading-progress');
      if (progressEl) progressEl.textContent = `${Math.round(percent)}%`;
    };
    
    updateProgress(10, 'Initializing canvas...');

    try {
      // Set up the canvas
      this.setupCanvas();
      
      // Initialize temperature manager
      if (temperatureManager) {
        await temperatureManager.initialize();
      }
      
      // Hide loading indicator when done
      updateProgress(100, 'Ready!');
      if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
      }
      
      // Set up event listeners
      window.addEventListener('resize', this.resize, { passive: true });
      
      // Initial resize to set canvas dimensions
      this.resize();
      
      // Initialize the grid
      this.initializeGrid();
      
      this.isInitialized = true;
      logger.info('CanvasManager initialized');
      
      // Start the render loop
      this.start();
      
      // Notify that the canvas is ready
      eventBus.emit('canvas:ready');
      
    } catch (error) {
      logger.error('Failed to initialize CanvasManager:', error);
      throw error;
    }
  }
  
  /**
   * Initialize the grid based on canvas dimensions
   */
  initializeGrid() {
    if (!this.canvas) {
      logger.warn('Canvas not available for grid initialization');
      return;
    }
    
    // Set canvas to full window size - matching original implementation
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    const cellSize = this.grid.cellSize;
    const width = Math.ceil(this.canvas.width / cellSize);
    const height = Math.ceil(this.canvas.height / cellSize);
    
    // Create a 2D array for the grid cells
    const cells = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push({
          x,
          y,
          type: 'empty',
          energy: 0,
          creature: null,
          temperature: 20,
          lastTempUpdate: 0
        });
      }
      cells.push(row);
    }
    
    // Update grid properties
    this.grid.width = width;
    this.grid.height = height;
    this.grid.cells = cells;
    
    logger.debug(`Initialized grid: ${width}x${height} (${cellSize}px cells)`);
    
    // Request a redraw
    this.needsRedraw = true;
  }
  
  /**
   * Handle window resize
   */
  resize() {
    if (!this.canvas) return;
    
    const container = this.canvas.parentElement;
    if (!container) {
      logger.warn('Canvas container not found');
      return;
    }
    
    // Get container dimensions with a minimum size
    const width = Math.max(container.clientWidth || 800, 100);
    const height = Math.max(container.clientHeight || 600, 100);
    
    // Only resize if dimensions are valid and changed
    if (width > 0 && height > 0) {
      // Check if dimensions have actually changed
      const needsResize = this.canvas.width !== width || this.canvas.height !== height;
      
      if (needsResize) {
        // Store the current scroll position
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        // Update canvas dimensions
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Reinitialize grid with new dimensions
        this.initializeGrid();
        
        // Restore scroll position
        window.scrollTo(scrollX, scrollY);
        
        logger.debug(`Canvas resized to ${width}x${height}`);
      }
    } else {
      logger.warn(`Invalid container dimensions: ${width}x${height}`);
    }
    

    // Hide any loading indicators
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }

    // Hide any modals that might be open
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (!modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    });

    // Dispatch a custom event to notify that the canvas is ready
    const event = new CustomEvent('canvas-ready', { 
      detail: { canvas: this.canvas }
    });
    document.dispatchEvent(event);
  }

  /**
   * Start the rendering loop
   */
  start() {
    if (this.isRunning) {
      logger.warn('CanvasManager is already running');
      return;
    }
    
    this.isRunning = true;
    this.lastRenderTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.render);
    logger.debug('CanvasManager started');
  }
  
  /**
   * Stop the rendering loop
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    logger.debug('CanvasManager stopped');
  }

  /**
   * Toggle pause state
   * @param {boolean} showMenu - Whether to show the pause menu
   */
  togglePause(showMenu = false) {
    if (this.isPaused) {
      this.resume();
      if (showMenu) {
        // Hide pause menu if shown
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) {
          pauseMenu.classList.add('hidden');
        }
      }
    } else {
      this.pause(showMenu);
    }
  }

  /**
   * Pause the simulation
   * @param {boolean} showMenu - Whether to show the pause menu
   */
  pause(showMenu = false) {
    this.isPaused = true;
    if (showMenu) {
      const pauseMenu = document.getElementById('pause-menu');
      if (pauseMenu) {
        pauseMenu.classList.remove('hidden');
      }
    }
  }

  /**
   * Resume the simulation
   */
  resume() {
    this.isPaused = false;
    this.lastRenderTime = performance.now();
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
  }

  /**
   * Main render method
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  render(timestamp) {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    try {
      // Calculate delta time
      const deltaTime = timestamp - (this.lastRenderTime || timestamp);
      this.lastRenderTime = timestamp;

      // Update FPS counter every second
      if (timestamp - this.lastFpsLog > 1000) {
        const fps = Math.round(1000 / deltaTime);
        logger.debug(`FPS: ${fps}`);
        this.lastFpsLog = timestamp;
      }

      // Clear the canvas
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw the grid
        this.drawGrid();

        // Update temperature system and draw if enabled
        if (temperatureManager) {
          temperatureManager.update();

          // Update selection tooltip if hovering over a cell
          if (selectionManager) {
            const hoveredCell = selectionManager.getHoveredCell();
            if (hoveredCell) {
              const temp = temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
              if (temp !== undefined && temp !== null) {
                selectionManager.updateTooltip(temp);
              }
            }

            // Draw temperature overlay if enabled
            if (this.showTemperature) {
              temperatureManager.render(this.ctx, this.grid.cellSize, true);
            }

            // Draw selection and hover effects
            selectionManager.render(this.ctx);

            // Update debug overlay with selected cell info
            const selectedCell = selectionManager.getSelectedCell();
            if (selectedCell) {
              const temp = temperatureManager.getTemperature(selectedCell.x, selectedCell.y);
              const cellInfo = { 
                temp,
                x: selectedCell.x,
                y: selectedCell.y
              };

              // Update debug overlay if available
              if (window.uiManager?.updateDebugOverlay) {
                window.uiManager.updateDebugOverlay(timestamp, cellInfo);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error in render loop:', error);
      this.stop();
    }
    
    // Request next frame if still running
    if (this.isRunning && !this.isPaused) {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
  }
  /**
   * Draw the grid on the canvas
   */
  drawGrid() {
    if (!this.ctx || !this.canvas) {
      logger.warn('Canvas or context not available for drawing grid');
      return false;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    const cellSize = this.grid.cellSize;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Set grid style - matching original implementation
    this.ctx.strokeStyle = this.grid.lineColor;
    this.ctx.lineWidth = 1;

    // Draw vertical grid lines
    for (let x = 0; x <= width; x += cellSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = 0; y <= height; y += cellSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    return true;
  }
  

  /**
   * Clean up resources
   */
  cleanup() {
    this.stop();
    
    // Remove event listeners
    window.removeEventListener('resize', this.resize);
    
    // Clean up canvas
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    
    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
    this.isRunning = false;
    
    logger.info('CanvasManager cleaned up');
  }
}

// Export a singleton instance
export const canvasManager = new CanvasManager();
