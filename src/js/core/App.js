import { logger } from '../utils/logger.js';
import { saveManager } from '../managers/SaveManager.js';
import { UIManager } from '../managers/UIManager.js';
import { selectionManager } from '../managers/SelectionManager.js';
import { temperatureManager } from '../managers/TemperatureManager.js';
import { AdminManager } from '../managers/AdminManager.js';
import { WasmManager } from '../utils/WasmManager.js';
import { mapManager } from '../managers/MapManager.js';
import { Engine } from './Engine.js';

class App {
    constructor() {
        this.isInitialized = false;
        this.isInitializing = false;
        this.wasmManager = new WasmManager();
        this.engine = new Engine();
        this.currentMainLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        this.gameState = null;
        this.showTemperature = false; // Toggle for temperature visualization
        
        // Initialize managers
        this.selectionManager = selectionManager;
        this.temperatureManager = temperatureManager;
        this.mapManager = mapManager;
        
        // Set app reference in selection manager
        if (this.selectionManager) {
            this.selectionManager.app = this;
            this.selectionManager.engine = this.engine; // Make sure engine is set
            
            // Setup temperature adjustment handler
            this.selectionManager.onTemperatureAdjust = (x, y, isDecrease = false) => {
                if (this.adminManager?.isAdmin) {
                    const currentTemp = this.temperatureManager.getTemperature(x, y);
                    const change = isDecrease ? -10 : 10;
                    const newTemp = currentTemp + change;
                    this.temperatureManager.setTemperature(x, y, newTemp);
                }
                // No logging of temperature changes
            };
            
            // Setup cell selection handler
            this.selectionManager.onCellSelected = (x, y) => {
                logger.log(`Cell selected at: (${x}, ${y})`);
                // Handle cell selection logic here
                this.selectedCell = { x, y };
                
                // If you have any UI that needs to update when a cell is selected,
                // you can trigger that update here
                if (this.uiManager) {
                    this.uiManager.updateSelectedCell(x, y);
                }
            };
        }
        
        this.saveManager = saveManager;
        this.saveManager._useFallback = true;
        this.adminManager = new AdminManager(this);
        this.uiManager = new UIManager(this);
        
        // Set up key event handling through UIManager
        this.handleKeyDown = (e) => {
            // Check if main menu is visible
            const mainMenu = document.getElementById('main-menu');
            if (mainMenu && mainMenu.style.display !== 'none') {
                // Don't process key events when main menu is visible
                return;
            }
            
            // Delegate to UIManager for all key handling
            this.uiManager.handleKeyEvent(e);
            
            // Special handling for spacebar to toggle pause without showing menu
            if (e.code === 'Space' && this.isRunning) {
                this.uiManager.togglePause(false); // Don't show menu, just show banner
                e.preventDefault(); // Prevent scrolling the page
                e.stopPropagation(); // Stop event bubbling
            }
        };
        
        // Add event listener for keydown events
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Initialize engine with render callback
        this.engine.initialize(
            this.update.bind(this),
            this.renderCallback.bind(this)
        );
    }

    async initialize() {
        if (this.isInitialized) {
            logger.log('Application already initialized');
            return;
        }
        
        if (this.isInitializing) {
            logger.log('Application initialization already in progress');
            return this.initializationPromise || Promise.resolve();
        }
        
        this.isInitializing = true;
        
        try {
            logger.log('Initializing application...');
            this.uiManager.initialize();
            this.adminManager.initialize();
            const wasmModule = await this.waitForWasmReady();
            this.onWasmReady(wasmModule);
            if (wasmModule && typeof wasmModule._initialize === 'function') {
                logger.log('Initializing WebAssembly module...');
                this.wasmInitializationPromise = this.initializeWasm();
                await this.wasmInitializationPromise;
            } else {
                logger.warn('WebAssembly module not found or missing initialization function');
            }
            
            this.isInitialized = true;
            logger.log('Application initialized successfully');
        } catch (error) {
            logger.error('Error during initialization:', error);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    onWasmReady(wasmModule) {
        // Initialize Save Manager with WebAssembly module
        if (wasmModule) {
            this.saveManager._wasmModule = wasmModule;
            logger.log('WebAssembly module set on SaveManager');
        } else {
            logger.warn('No WebAssembly module provided to onWasmReady');
        }
        
        // Initialize any WebAssembly-dependent components
        if (this.temperatureManager && typeof this.temperatureManager.initialize === 'function') {
            this.temperatureManager.initialize();
        }
    }

    async init() {
        logger.log('Initializing application...');
        
        try {
            // Initialize the engine
            this.engine = new Engine({
                targetFPS: 60,
                showFPS: true,
                pauseOnBlur: true
            });

            // Initialize UI Manager
            this.uiManager = new UIManager(this);
            
            // Initialize selection manager with canvas and cell size
            const canvas = document.querySelector('canvas');
            if (canvas) {
                this.selectionManager.engine = this.engine; // Pass engine reference
                this.selectionManager.init(canvas, 20); // 20 is the cell size
            }
            
            // Initialize WebAssembly
            this.initializeWasm();
            
            // Start the game loop
            this.startGameLoop();
            
            logger.log('Application initialized successfully');
        } catch (error) {
            logger.error('Error during initialization:', error);
            // Fallback to JavaScript implementation
            this.saveManager._useFallback = true;
            logger.warn('Falling back to JavaScript implementation');
        }
    }
    
    /**
     * Initialize WebAssembly module
     */
    async initializeWasm() {
        if (this.saveManager._useFallback) {
            logger.log('Using JavaScript fallback, skipping WebAssembly initialization');
            return null;
        }
        
        logger.log('Initializing WebAssembly...');
        
        try {
            // Initialize the WebAssembly module using WasmManager
            await this.wasmManager.init();
            
            // Get the WebAssembly module instance
            const wasmModule = this.wasmManager.module;
            
            if (wasmModule) {
                this.saveManager.setWasmModule(wasmModule);
                logger.log('WebAssembly module initialized successfully');
                return wasmModule;
            } else {
                throw new Error('Failed to initialize WebAssembly module');
            }
        } catch (error) {
            logger.error('Error initializing WebAssembly:', error);
            this.saveManager._useFallback = true;
            logger.warn('Falling back to JavaScript implementation');
            return null;
        }
    }

    /**
     * Render callback for the engine
     * @param {number} deltaTime - Time since last frame in milliseconds
     * @param {number} frameRatio - Interpolation factor for smooth rendering
     * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
     */
    async renderCallback(deltaTime, frameRatio, ctx, isPaused = false) {
        // Clear the canvas
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Get camera position
        const camera = this.engine.camera;
        const cameraX = Math.round(camera.x);
        const cameraY = Math.round(camera.y);
        
        // Draw the grid using MapManager
        this.mapManager.render(ctx, cameraX, cameraY);
        const timestamp = performance.now();
        
        // Update our internal state to match the engine's state
        if (this.isPaused !== isPaused) {
            this.isPaused = isPaused;
            logger.log(`App renderCallback: isPaused=${isPaused}`);
        }
        
        // Update temperature system if not paused
        if (!isPaused && this.temperatureManager) {
            try {
                // Only update the temperature system when not paused
                if (typeof this.temperatureManager.update === 'function') {
                    this.temperatureManager.update();
                }
                
                // Update selection tooltip if hovering over a cell
                if (this.selectionManager) {
                    const hoveredCell = this.selectionManager.getHoveredCell();
                    if (hoveredCell && 
                        typeof this.temperatureManager.getTemperature === 'function') {
                        const temp = this.temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
                        if (temp !== undefined && temp !== null) {
                            this.selectionManager.updateTooltip(temp);
                        }
                    }
                }
                
                // Render temperature overlay if enabled
                if (this.temperatureManager && typeof this.temperatureManager.render === 'function') {
                    try {
                        const cellSize = this.mapManager?.cellSize || 20;
                        this.temperatureManager.render(ctx, cellSize, this.temperatureManager.showTemperature, cameraX, cameraY);
                    } catch (error) {
                        console.error('Error in temperature overlay render:', error);
                    }
                }
            } catch (error) {
                console.error('Error updating temperature system:', error);
            }
        }
        
        // Draw selection and hover effects
        if (this.selectionManager) {
            this.selectionManager.render(ctx);
            
            // Update debug overlay with selected cell info
            let cellInfo = null;
            const selectedCell = this.selectionManager.getSelectedCell();
            if (selectedCell && this.temperatureManager) {
                const temp = this.temperatureManager.getTemperature(selectedCell.x, selectedCell.y);
                const cell = this.mapManager.grid[selectedCell.y]?.[selectedCell.x];
                const cellType = cell?.type || 'unknown';
                
                cellInfo = { 
                    temp,
                    x: selectedCell.x,
                    y: selectedCell.y,
                    type: cellType,
                    isPaused // Include paused state in debug info
                };
            } else {
                cellInfo = { isPaused }; // Still include paused state even if no cell is selected
            }
            
            if (this.uiManager && this.uiManager.updateDebugOverlay) {
                this.uiManager.updateDebugOverlay(timestamp, cellInfo);
            }
        }
    }
    /**
     * Waits for the WebAssembly module to be ready
     * @returns {Promise<Object|null>} The WebAssembly module or null if not available
     */
    async waitForWasmReady() {
        try {
            // Use WasmManager to wait for the WebAssembly module to be ready
            await this.wasmManager.init();
            return this.wasmManager.module;
        } catch (error) {
            logger.error('Error waiting for WebAssembly to be ready:', error);
            return null;
        }
    }

    /**
     * Shows the new game modal to get the save name
     */
    startNewGame() {
        logger.log('Showing new game modal...');
        this.uiManager.showNewGameModal();
    }

    async confirmNewGame() {
        let saveName = this.uiManager.getSaveName();
        
        // Provide a default name if empty
        if (!saveName) {
            saveName = 'My Game';
        }
        
        // Store the save name in the game state
        if (!this.gameState) this.gameState = {};
        this.gameState.saveName = saveName;
        
        logger.log(`Starting new game with save name: ${saveName}`);
        this.uiManager.hideNewGameModal();
        
        try {
            // Make sure WebAssembly is loaded
            if (!window.Module) {
                logger.error('WebAssembly module not loaded');
                return;
            }
            
            // Initialize the game state with the save name
            logger.log('Initializing game state...');
            
            // Show the game container and hide the main menu and pause menu using uiManager
            this.uiManager.hideNewGameModal();
            this.uiManager.hideMainMenu();
            this.uiManager.hidePauseMenu();
            
            // Show the game container
            const gameContainer = this.uiManager.elements.gameContainer;
            if (gameContainer) gameContainer.classList.remove('hidden');
            
            // Reset the simulation with the save name
            await this.resetSimulation(saveName);
            
            // Start the simulation and wait for it to complete
            this.isRunning = true;
            this.isPaused = false;
            await this.startSimulation();
            
            logger.log('New game started successfully');
            
        } catch (error) {
            logger.error('Failed to start new game:', error);
            throw error;
        }
    }
    
    /**
     * Shows the new game modal to get the save name
     */
    async startNewGame() {
        if (this.uiManager && typeof this.uiManager.showNewGameModal === 'function') {
            this.uiManager.showNewGameModal();
        } else {
            logger.error('UIManager or showNewGameModal method not available');
            throw new Error('Failed to show new game modal: UI Manager not available');
        }
    }
    
    /**
     * Loads a saved game
     * @param {string} saveId - The ID of the save to load
     */
    async loadGame(saveId) {
        logger.log(`Loading game with ID: ${saveId}`);
        
        try {
            // Show loading indicator
            this.uiManager.showLoading('Loading game...');
            
            // Load the saved game state using the instance method
            const savedState = await this.saveManager.loadGame(saveId, (progress, message) => {
                this.uiManager.updateLoading(progress, message);
            });
            
            if (!savedState) {
                throw new Error('Invalid save data');
            }
            
            // Hide the save manager modal and main menu
            this.uiManager.hideSaveManager();
            this.uiManager.hideMainMenu();
            
            // Hide loading indicator
            this.uiManager.hideLoading();
            
            // Show the game container
            if (this.uiManager.elements.gameContainer) {
                this.uiManager.elements.gameContainer.classList.remove('hidden');
            }
            
            // Log the saved state for debugging
            logger.log('Saved state when loading:', {
                hasTemperatureData: !!savedState.temperatureData,
                gridDimensions: savedState.grid || 'No grid dimensions',
                saveId: savedState.saveId || savedState.id,
                saveName: savedState.saveName || savedState.name
            });
            
            // Store temperature data and grid dimensions before resetting the simulation
            const temperatureData = savedState.temperatureData;
            const gridDimensions = savedState.grid || {};
            
            // Log the temperature data we're about to save
            if (temperatureData) {
                logger.log('Loading temperature data from save:', {
                    width: temperatureData.width,
                    height: temperatureData.height,
                    hasCells: !!temperatureData.cells && temperatureData.cells.length > 0
                });
            } else {
                logger.warn('No temperature data found in saved state');
            }
            
            // Reset the simulation with the loaded state
            await this.resetSimulation(savedState.saveName || 'Loaded Game');
            
            // Apply the loaded game state, making sure to preserve the saveId and saveName
            this.gameState = { 
                ...this.gameState, 
                ...savedState,
                // Ensure saveId and saveName are preserved from the loaded state
                saveId: savedState.saveId || savedState.id, // Handle both formats for backward compatibility
                saveName: savedState.saveName || savedState.name || 'Loaded Game'
            };
            
            // If we have temperature data, apply it to the temperature manager
            if (temperatureData) {
                try {
                    // Log the temperature data we're about to load
                    logger.log('Loading temperature data:', {
                        hasCells: !!temperatureData.cells,
                        width: temperatureData.width,
                        height: temperatureData.height,
                        ambientTemp: temperatureData.ambientTemp
                    });

                    // Initialize temperature system with the loaded dimensions or fall back to current grid
                    const width = temperatureData.width || this.gameState.grid?.width;
                    const height = temperatureData.height || this.gameState.grid?.height;
                    const ambientTemp = temperatureData.ambientTemp || 20;
                    
                    if (width > 0 && height > 0) {
                        logger.log(`Initializing temperature system with dimensions: ${width}x${height}, ambient: ${ambientTemp}°C`);
                        
                        // Initialize the temperature system
                        await this.temperatureManager.initialize(width, height, ambientTemp);
                        
                        // Apply the saved temperature data
                        logger.log('Setting temperature data from save');
                        const success = this.temperatureManager.setTemperatureData(temperatureData);
                        
                        if (success) {
                            logger.log('Successfully loaded temperature data');
                        } else {
                            logger.error('Failed to set temperature data');
                        }
                    } else {
                        logger.error('Invalid dimensions for temperature system:', { width, height });
                    }
                } catch (error) {
                    logger.error('Error initializing temperature system:', error);
                }
            } else {
                logger.warn('No temperature data to load, initializing with default values');
                const width = this.gameState.grid?.width || 0;
                const height = this.gameState.grid?.height || 0;
                if (width > 0 && height > 0) {
                    this.temperatureManager.initialize(width, height);
                }
            }
            
            logger.log('Game state after loading:', {
                saveId: this.gameState.saveId,
                saveName: this.gameState.saveName,
                hasGameState: !!this.gameState,
                grid: this.gameState.grid ? {
                    width: this.gameState.grid.width,
                    height: this.gameState.grid.height
                } : 'No grid data'
            });
            
            // Start the simulation
            this.isRunning = true;
            this.isPaused = false;
            
            // Hide the pause menu if it's visible
            this.uiManager.hidePauseMenu();
            
            // Start the simulation
            await this.startSimulation();
            
            logger.log('Game loaded successfully');
            this.uiManager.showNotification('Game loaded successfully!');
            
        } catch (error) {
            logger.error('Error loading game:', error);
            this.uiManager.showNotification('An error occurred while loading the game. Please check the console for details.');
            
            // If loading fails, make sure to show the main menu
            this.uiManager.showMainMenu();
        }
    }

    /**
     * Update callback for the engine
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(deltaTime) {
        // Update UI components including camera movement
        if (this.uiManager && typeof this.uiManager.update === 'function') {
            this.uiManager.update(deltaTime);
        }
        
        // Add any other game state updates here
        // This method is called at a fixed timestep by the engine
    }

    async startSimulation() {
        if (!window.Module) {
            const error = new Error('WebAssembly module not loaded');
            logger.error(error.message);
            throw error;
        }
        
        try {
            // Log available Module functions for debugging
            const moduleFunctions = Object.keys(window.Module).filter(k => 
                typeof window.Module[k] === 'function' && 
                !k.startsWith('_emscripten_')
            );
            logger.log('Available Module functions:', moduleFunctions);
            
            // Initialize the simulation grid
            await this.initializeSimulationGrid();
            
            // Check for initialization functions in different locations
            let initFunc = null;
            
            // Check in Module.asm first
            if (window.Module.asm) {
                if (typeof window.Module.asm._initialize === 'function') {
                    initFunc = window.Module.asm._initialize;
                    logger.log('Found _initialize in Module.asm');
                } else if (typeof window.Module.asm._start === 'function') {
                    initFunc = window.Module.asm._start;
                    logger.log('Found _start in Module.asm');
                } else if (typeof window.Module.asm._main === 'function') {
                    initFunc = window.Module.asm._main;
                    logger.log('Found _main in Module.asm');
                }
            }
            
            // If not found in Module.asm, check in Module
            if (!initFunc) {
                if (typeof window.Module._initialize === 'function') {
                    initFunc = window.Module._initialize;
                    logger.log('Found _initialize in Module');
                } else if (typeof window.Module._start === 'function') {
                    initFunc = window.Module._start;
                    logger.log('Found _start in Module');
                } else if (typeof window.Module._main === 'function') {
                    initFunc = window.Module._main;
                    logger.log('Found _main in Module');
                }
            }
            
            // If we found an initialization function, call it
            if (initFunc) {
                logger.log('Initializing simulation...');
                initFunc();
                this.isRunning = true;
                
                // Update UI if elements exist
                const { startBtn, pauseBtn } = this.elements || {};
                if (startBtn) startBtn.disabled = true;
                if (pauseBtn) pauseBtn.disabled = false;
                
                logger.log('Engine started successfully');
            } else {
                // If no initialization function was found, set up our own render loop
                logger.log('No initialization function found, setting up render loop...');
                
                // Set simulation state
                this.isRunning = true;
                this.isPaused = false;
                this.lastRenderTime = null;
                
                // Show debug overlay when game starts
                if (this.uiManager) {
                    this.uiManager.showDebugOverlay();
                }
                
                // Start the engine
                if (this.engine && typeof this.engine.start === 'function') {
                    this.engine.start();
                    logger.log('Engine render loop started');
                } else {
                    logger.error('Engine not available or missing start method');
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Error starting simulation:', error);
            throw error;
        }
    }

    /**
     * Initializes the simulation grid based on the canvas size
     */
    async initializeSimulationGrid() {
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) {
                throw new Error('Canvas element not found');
            }
            
            // Set canvas to full window size
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
                
            // Define grid properties
            const cellSize = 20; // Size of each grid cell in pixels
            const width = Math.ceil(canvas.width / cellSize);
            const height = Math.ceil(canvas.height / cellSize);
            
            this.grid = {
                cellSize,
                width,
                height,
                cells: []
            };
            
            try {
                // Initialize the temperature manager with the app instance
                this.temperatureManager.app = this;
                
                // Get the map dimensions from MapManager
                const mapWidth = this.mapManager.gridWidth;
                const mapHeight = this.mapManager.gridHeight;
                
                // Initialize the temperature system with the full map dimensions
                await this.temperatureManager.initialize(mapWidth, mapHeight);
                
                // Set some initial temperature values for testing
                for (let x = 0; x < mapWidth; x++) {
                    for (let y = 0; y < mapHeight; y++) {
                        // Create a temperature gradient for testing
                        const temp = 10 + (x / mapWidth) * 30; // 10°C to 40°C gradient
                        this.temperatureManager.setTemperature(x, y, temp);
                    }
                }
                
                logger.log(`Initialized temperature system with ${width}x${height} grid`);
            } catch (error) {
                logger.error('Error initializing temperature system:', error);
                // Fall back to default temperature
                await this.temperatureManager.initialize(width, height, 20);
                logger.log('Initialized temperature system with default temperature after error');
            }
            
            // Initialize selection manager
            this.selectionManager.init(canvas, cellSize);
            
            // Initialize grid cells
            for (let y = 0; y < height; y++) {
                const row = [];
                for (let x = 0; x < width; x++) {
                    const temp = this.temperatureManager.getTemperature(x, y);
                    row.push({
                        x,
                        y,
                        type: 'empty',
                        energy: 0,
                        creature: null,
                        temperature: temp,
                        lastTempUpdate: 0
                    });
                }
                this.grid.cells.push(row);
            }
            
            logger.log(`Initialized grid: ${width}x${height} (${cellSize}px cells)`);
            
        } catch (error) {
            logger.error('Failed to initialize simulation grid:', error);
            throw error;
        }
    }

    /**
     * Draws the simulation grid using MapManager
     * @param {CanvasRenderingContext2D} [ctx] - Optional canvas 2D context
     * @param {number} [width] - Optional canvas width
     * @param {number} [height] - Optional canvas height
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async drawGrid(ctx, width, height) {
        try {
            // If no context is provided, get it from the canvas
            if (!ctx) {
                const canvas = document.querySelector('canvas');
                if (!canvas) return false;

                ctx = canvas.getContext('2d');
                if (!ctx) return false;

                width = width || canvas.width;
                height = height || canvas.height;
            }

            // Clear the canvas
            ctx.clearRect(0, 0, width, height);

            // Get camera position from engine
            const cameraX = this.engine?.camera?.x || 0;
            const cameraY = this.engine?.camera?.y || 0;
            
            // Delegate grid rendering to MapManager
            if (this.mapManager) {
                this.mapManager.render(ctx, cameraX, cameraY);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Error drawing grid:', error);
            return false;
        }
    }
    
    /**
     * Resets the simulation to its initial state
     * @param {string} [saveName='My Game'] - Name of the save file
     * @returns {Promise<boolean>} True if reset was successful
     */
    async resetSimulation(saveName = 'My Game') {
        try {
            // Preserve temperature data and grid dimensions if they exist
            const temperatureData = this.gameState?.temperatureData;
            const gridDimensions = this.gameState?.grid;
            
            // Log the current state before reset
            logger.log('Resetting simulation with data:', {
                hasTemperatureData: !!temperatureData,
                gridDimensions: gridDimensions || 'No grid dimensions',
                saveName: saveName
            });
            
            if (temperatureData) {
                logger.log('Preserving temperature data during reset:', {
                    width: temperatureData.width,
                    height: temperatureData.height,
                    hasCells: !!temperatureData.cells && temperatureData.cells.length > 0
                });
            }

            // Reset game state
            this.gameState = {
                isRunning: false,
                isPaused: false,
                saveName: saveName,
                createdAt: new Date().toISOString(),
                lastSaved: null,
                // Initialize with empty grid that will be populated by initializeSimulationGrid
                grid: {
                    width: 0,
                    height: 0,
                    cellSize: 20 // Default cell size
                },
                // Preserve temperature data if it exists
                ...(temperatureData && { temperatureData }),
                // Preserve grid dimensions if they exist, otherwise they'll be set by initializeSimulationGrid
                ...(gridDimensions && { grid: { 
                    ...this.gameState?.grid, // Keep any existing grid properties
                    ...gridDimensions // Override with saved dimensions
                }})
            };
            
            // Reset the engine
            await this.engine.resetSimulation({
                saveName,
                temperatureData,
                gridDimensions
            });

            // Reinitialize the grid
            await this.initializeSimulationGrid();

            // Reapply temperature data if it exists and we have valid grid dimensions
            if (temperatureData && gridDimensions?.width && gridDimensions?.height) {
                this.temperatureManager.initialize(gridDimensions.width, gridDimensions.height);
                this.temperatureManager.setTemperatureData(temperatureData);
            }

            logger.log('Simulation reset successfully', 'info');
            return true;

        } catch (error) {
            logger.error('Failed to reset simulation:', error);
            throw error;
        }
    }

    /**
     * Forces a mouse move event to update the selected cell
     */
    forceMouseMoveUpdate() {
        if (!this.selectionManager || !this.selectionManager.lastMouseEvent) return;
        
        // Get the last mouse event and canvas
        const lastEvent = this.selectionManager.lastMouseEvent;
        const canvas = this.selectionManager.canvas;
        
        // Calculate the cell coordinates directly
        const rect = canvas.getBoundingClientRect();
        const x = lastEvent.clientX - rect.left;
        const y = lastEvent.clientY - rect.top;
        const cellX = Math.floor(x / this.selectionManager.cellSize);
        const cellY = Math.floor(y / this.selectionManager.cellSize);
        
        // Force update the hovered cell
        this.selectionManager.hoveredCell = { x: cellX, y: cellY };
        
        // If there's a temperature to show, update the tooltip
        if (this.temperatureManager) {
            const temp = this.temperatureManager.getTemperature(cellX, cellY);
            if (temp !== undefined) {
                this.selectionManager.updateTooltip(temp);
            }
        }
        
        // Also dispatch a mouse move event for any other listeners
        const newEvent = new MouseEvent('mousemove', {
            clientX: lastEvent.clientX,
            clientY: lastEvent.clientY,
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        // Dispatch the event on the canvas
        canvas.dispatchEvent(newEvent);
    }
}

// Export a singleton instance
export const app = new App();
