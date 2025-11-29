import { logger } from './logger.js';
import { saveManager } from './saveManager.js';
import { UIManager } from './uiManager.js';

class App {
    constructor() {
        this.isInitialized = false;
        this.isInitializing = false;
        this.wasmInitializationPromise = null;
        this.currentMainLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        this.gameState = null;
        
        // Initialize Save Manager
        this.saveManager = saveManager;
        
        // Initialize UI Manager with reference to this app instance
        this.uiManager = new UIManager(this);
        
        // Initialize diagnostics channel
        this.diagChannel = null;
        this.setupDiagnostics();
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
            
            // Initialize UI
            this.uiManager.initialize();
            this.setupDiagnostics();
            
            // Wait for WebAssembly to be ready
            await this.waitForWasmReady();
            
            // Initialize WebAssembly module
            if (window.Module && typeof window.Module._initialize === 'function') {
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

    // UI-related methods have been moved to UIManager

    // UI-related methods have been moved to UIManager

    setupDiagnostics() {
        try {
            this.diagChannel = new BroadcastChannel('evolution-sim-diag');
            
            // Send initial status
            this.sendDiagMessage('status', { connected: true });
            
            // Set up a ping interval to keep the connection alive
            this.diagPingInterval = setInterval(() => {
                this.sendDiagMessage('status', { connected: true });
            }, 2000); // Send status update every 2 seconds
            
            // Send a welcome message
            this.sendDiagMessage('log', {
                message: 'Diagnostics channel initialized',
                type: 'info'
            });
            
        } catch (error) {
            console.error('Failed to initialize diagnostics channel:', error);
        }
    }

    sendDiagMessage(type, data = {}) {
        if (!this.diagChannel) return;
        
        try {
            this.diagChannel.postMessage({
                type,
                data,
                timestamp: Date.now()
            });
            
            // Update last message time for connection tracking
            this.lastDiagMessageTime = Date.now();
            
        } catch (error) {
            console.error('Failed to send diagnostics message:', error);
        }
    }

    waitForWasmReady() {
        return new Promise((resolve, reject) => {
            if (window.wasmReady) {
                logger.log('WebAssembly already initialized');
                resolve();
                return;
            }
            
            logger.log('Waiting for WebAssembly to be ready...');
            const timeout = setTimeout(() => {
                const error = new Error('WebAssembly initialization timed out after 30 seconds');
                logger.error(error.message);
                
                // Log additional debug information
                if (window.Module) {
                    logger.error('WebAssembly Module state:', {
                        status: window.Module.status,
                        error: window.Module.error,
                        ready: window.Module.asm ? 'Module.asm exists' : 'Module.asm is undefined'
                    });
                } else {
                    logger.error('window.Module is not defined');
                }
                
                reject(error);
            }, 30000); // 30 second timeout
            
            // Listen for the wasm-ready event
            const onWasmReady = () => {
                clearTimeout(timeout);
                document.removeEventListener('wasm-ready', onWasmReady);
                logger.log('WebAssembly ready event received');
                resolve(true);
            };
            
            document.addEventListener('wasm-ready', onWasmReady);
            
            // Also check periodically in case the event was missed
            const checkReady = () => {
                if (window.wasmReady) {
                    clearTimeout(timeout);
                    document.removeEventListener('wasm-ready', onWasmReady);
                    logger.log('WebAssembly ready (window.wasmReady = true)');
                    resolve(true);
                } else if (window.Module && window.Module.asm) {
                    clearTimeout(timeout);
                    document.removeEventListener('wasm-ready', onWasmReady);
                    logger.log('WebAssembly ready (Module.asm detected)');
                    resolve(true);
                } else {
                    requestAnimationFrame(checkReady);
                }
            };
            
            // Start checking
            checkReady();
        });
    }
    
    // New game modal methods
    showNewGameModal() {
        // Delegate to UIManager to show the new game modal
        this.uiManager.showNewGameModal();
    }
    

    hideNewGameModal() {
        this.uiManager.hideNewGameModal();
    }

    showMainMenu() {
        this.uiManager.showMainMenu();
    }

    hideMainMenu() {
        this.uiManager.hideMainMenu();
    }

    showPauseMenu() {
        this.uiManager.showPauseMenu();
    }

    hidePauseMenu() {
        this.uiManager.hidePauseMenu();
    }

    getSaveName() {
        return this.uiManager.getSaveName();
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
        this.hideNewGameModal();
        
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
    
    async startNewGame() {
        this.showNewGameModal();
    }
    
    async loadWasm() {
        logger.log('Loading WebAssembly module...');
        
        try {
            // Check if the WebAssembly module is already loaded and initialized
            if (window.Module && window.Module.asm) {
                logger.log('WebAssembly module already loaded and initialized');
                return true;
            }
            
            // If Module exists but not initialized, wait for initialization
            if (window.Module && !window.wasmReady) {
                logger.log('WebAssembly module loaded but not yet initialized, waiting...');
                await this.waitForWasmReady();
                return true;
            }
            
            // If we get here, the Module might not be loaded at all
            if (!window.Module) {
                // Try to trigger the WebAssembly loading if it hasn't started
                if (window.loadWasmScript && typeof window.loadWasmScript === 'function') {
                    logger.log('Manually triggering WebAssembly script load...');
                    window.loadWasmScript();
                } else {
                    throw new Error('WebAssembly module loader not found');
                }
            }
            
            // Wait for the WebAssembly module to be ready
            await this.waitForWasmReady();
            
            // Final check to make sure everything is loaded
            if (!window.Module || !window.Module.asm) {
                throw new Error('WebAssembly module failed to initialize');
            }
            
            logger.log('WebAssembly module loaded and initialized successfully');
            
            // Log available functions for debugging
            const moduleFunctions = Object.keys(window.Module).filter(k => 
                typeof window.Module[k] === 'function' && 
                !k.startsWith('_emscripten_')
            );
            logger.log('Available Module functions:', moduleFunctions);
            
            if (window.Module.asm) {
                const asmFunctions = Object.keys(window.Module.asm).filter(
                    k => typeof window.Module.asm[k] === 'function'
                );
                logger.log('Available Module.asm functions:', asmFunctions);
            }
            
            return true;
            
        } catch (error) {
            logger.error('Failed to load WebAssembly module:', error);
            
            // Additional debug information
            if (window.Module) {
                logger.error('Module state on error:', {
                    status: window.Module.status,
                    error: window.Module.error,
                    ready: window.Module.asm ? 'Module.asm exists' : 'Module.asm is undefined'
                });
            } else {
                logger.error('window.Module is not defined');
            }
            
            throw error;
        }
    }

    /**
     * Shows the new game modal to get the save name
     */
    startNewGame() {
        logger.log('Showing new game modal...');
        this.uiManager.showNewGameModal();
    }

    /**
     * Shows the save manager modal with a list of saved games
     */
    showSaveManager() {
        this.uiManager.showSaveManager();
    }
    
    /**
     * Hides the save manager modal
     */
    hideSaveManager() {
        this.uiManager.hideSaveManager();
    }
    
    /**
     * Refreshes the list of saved games in the save manager modal
     */
    refreshSaveList() {
        this.uiManager.refreshSaveList();
    }

    
    /**
     * Loads a saved game
     * @param {string} saveId - The ID of the save to load
     */
    async loadGame(saveId) {
        logger.log(`Loading game with ID: ${saveId}`);
        
        try {
            // Load the saved game state
            const savedState = saveManager.loadGame(saveId);
            
            if (!savedState) {
                logger.error('Failed to load saved game: Invalid save data');
                this.uiManager.showNotification('Failed to load saved game. The save file may be corrupted.');
                return;
            }
            
            // Hide the save manager modal and main menu
            this.hideSaveManager();
            this.hideMainMenu();
            
            // Show the game container
            if (this.uiManager.elements.gameContainer) {
                this.uiManager.elements.gameContainer.classList.remove('hidden');
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
            
            logger.log('Game state after loading:', {
                saveId: this.gameState.saveId,
                saveName: this.gameState.saveName,
                hasGameState: !!this.gameState
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

    showSettings() {
        logger.log('Showing settings...');
        // Implementation for showing settings
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
                const { startBtn, pauseBtn } = this.elements;
                if (startBtn) startBtn.disabled = true;
                if (pauseBtn) pauseBtn.disabled = false;
                
                logger.log('Simulation started successfully', 'success');
                return;
            }
            
            // If no initialization function was found, try setting up a render loop
            logger.log('No initialization function found, setting up render loop...');
            
            // Create a simple render loop
            const canvas = document.querySelector('canvas');
            if (!canvas) {
                logger.error('Canvas element not found');
                return;
            }
            
            // Define render function
            const render = (timestamp) => {
                if (!this.isRunning) return;
                
                try {
                    // Clear the canvas
                    const canvas = document.querySelector('canvas');
                    if (!canvas) return;
                    
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    // Clear the canvas
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Draw the grid
                    this.drawGrid();
                    
                    // Draw any game objects here
                    
                    // Continue the render loop
                    this.currentMainLoop = window.requestAnimationFrame(render);
                } catch (error) {
                    logger.error('Error in render loop:', error);
                }
            };
            
            // Start the render loop
            this.currentMainLoop = window.requestAnimationFrame(render);
            logger.log('Render loop started');
        } catch (error) {
            logger.error('Error starting simulation:', error);
            throw error;
        }
    }

    /**
     * Toggles the pause state of the simulation
     */
    togglePause() {
        if (!this.isRunning) return;
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            // Pause the simulation
            if (window.Module) {
                if (typeof window.Module._emscripten_pause_main_loop === 'function') {
                    window.Module._emscripten_pause_main_loop();
                } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
                    window.Module.asm._emscripten_pause_main_loop();
                }
            }
            
            // Show pause menu using uiManager
            this.uiManager.showPauseMenu();
            
            logger.log('Simulation paused');
        } else {
            this.resumeSimulation();
        }
    }

    /**
     * Resumes the simulation from a paused state
     */
    resumeSimulation() {
        if (window.Module) {
            if (typeof window.Module._emscripten_resume_main_loop === 'function') {
                window.Module._emscripten_resume_main_loop();
            } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
                window.Module.asm._emscripten_resume_main_loop();
            }
        }
        
        // Hide pause menu using uiManager
        this.uiManager.hidePauseMenu();
        
        this.isPaused = false;
        logger.log('Simulation resumed');
    }

    /**
     * Handles the Resume button click in the pause menu
     */
    onResumeClick() {
        this.resumeSimulation();
    }

    /**
     * Handles the Save Game button click in the pause menu
     */
    /**
     * Handles the Save & Quit button click in the pause menu
     */
    async onSaveAndQuitClick() {
        logger.log('Save & Quit clicked');
        
        try {
            // First save the game
            await this.onSaveGameClick();
            
            // Small delay to show the save notification
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then quit to menu
            this.onQuitToMenuClick();
        } catch (error) {
            logger.error('Error during save & quit:', error);
            this.uiManager.showNotification('Error saving game. Changes may not be saved.');
        }
    }
    
    /**
     * Handles the Save Game button click in the pause menu
     */
    onSaveGameClick() {
        logger.log('Saving game...');
        
        // Check if we have a game state
        if (!this.gameState) {
            logger.error('No active game state to save');
            this.uiManager.showNotification('Error: No active game to save');
            return Promise.reject('No active game state');
        }
        
        try {
            // Create a simplified game state for saving
            const gameState = {
                turnCount: this.gameState.turnCount || 0,
                // Include other game state properties as needed
                ...this.gameState
            };
            
            // Check if this is an existing game with a save ID
            const saveId = this.gameState.saveId;
            const saveName = this.gameState.saveName || `Game ${new Date().toLocaleString()}`;
            
            if (saveId) {
                // Update existing save
                const updatedSave = saveManager.saveGame(gameState, saveName, saveId);
                if (updatedSave) {
                    logger.log('Game updated successfully:', updatedSave);
                    this.uiManager.showNotification('Game saved successfully!');
                    return Promise.resolve(updatedSave);
                } else {
                    throw new Error('Failed to update save');
                }
            } else {
                // Create a new save with the current game name or a default name
                const newSave = saveManager.saveGame(gameState, saveName);
                if (newSave) {
                    // Store the save ID and name for future updates
                    this.gameState.saveId = newSave.id;
                    this.gameState.saveName = saveName; // Ensure name is stored for future saves
                    logger.log('New game saved:', newSave);
                    this.uiManager.showNotification('New game saved successfully!');
                    return Promise.resolve(newSave);
                } else {
                    throw new Error('Failed to create new save');
                }
            }
        } catch (error) {
            logger.error('Error saving game:', error);
            this.uiManager.showNotification('Error saving game: ' + (error.message || 'Unknown error'));
            return Promise.reject(error);
        }
    }
    
    // Notification functionality has been moved to UIManager
    // Use this.uiManager.showNotification() instead
    
    async onQuitToMenuClick() {
        try {
            logger.log('Quitting to main menu...');
            
            // Reset the simulation
            await this.resetSimulation();
            
            // Show main menu and hide game container using uiManager
            this.uiManager.showMainMenu();
            
            // Hide the game container
            if (this.uiManager.elements.gameContainer) {
                this.uiManager.elements.gameContainer.classList.add('hidden');
            }
            
            // Reset states
            this.isRunning = false;
            this.isPaused = false;
            
            logger.log('Successfully returned to main menu');
        } catch (error) {
            logger.error('Error during quit to menu:', error);
            throw error;
        }
    }

    /**
     * Initializes the simulation grid based on the canvas size
     */
    async initializeSimulationGrid() {
        logger.log('Initializing simulation grid...');
        
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) {
                throw new Error('Canvas element not found');
            }
            
            // Set canvas to full window size
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            // Define grid properties
            this.grid = {
                cellSize: 20, // Size of each grid cell in pixels
                width: Math.ceil(canvas.width / 20),
                height: Math.ceil(canvas.height / 20),
                cells: []
            };
            
            // Initialize grid cells
            for (let y = 0; y < this.grid.height; y++) {
                const row = [];
                for (let x = 0; x < this.grid.width; x++) {
                    // Initialize each cell with default values
                    row.push({
                        x,
                        y,
                        type: 'empty', // 'empty', 'wall', 'food', 'creature', etc.
                        energy: 0,
                        creature: null
                    });
                }
                this.grid.cells.push(row);
            }
            
            logger.log(`Initialized grid: ${this.grid.width}x${this.grid.height} (${this.grid.cellSize}px cells)`);
            
        } catch (error) {
            logger.error('Failed to initialize simulation grid:', error);
            throw error;
        }
    }
    
    // Food initialization will be implemented here later
    
    /**
     * Draws the simulation grid
     * @param {CanvasRenderingContext2D} [ctx] - Optional canvas 2D context
     * @param {number} [width] - Optional canvas width
     * @param {number} [height] - Optional canvas height
     */
    async drawGrid(ctx, width, height) {
        try {
            // If no context is provided, get it from the canvas
            if (!ctx) {
                const canvas = document.querySelector('canvas');
                if (!canvas) return;
                
                ctx = canvas.getContext('2d');
                if (!ctx) return;
                
                width = width || canvas.width;
                height = height || canvas.height;
            }
            
            // If we have a grid, use its cell size, otherwise default to 20
            const cellSize = this.grid?.cellSize || 20;
            
            // Set grid line style
            ctx.strokeStyle = this.grid ? '#1a1a1a' : '#333333';
            ctx.lineWidth = this.grid ? 1 : 0.5;
            
            // Vertical lines
            for (let x = 0; x <= width; x += cellSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            
            // Horizontal lines
            for (let y = 0; y <= height; y += cellSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            
            return true;
            
        } catch (error) {
            logger.error('Error drawing grid:', error);
            throw error;
        }
    }
    
    /**
     * Resets the simulation to its initial state
     * @param {string} [saveName='My Game'] - Name of the save file
     * @returns {Promise<boolean>} True if reset was successful
     */
    async resetSimulation(saveName = 'My Game') {
        try {
            logger.log(`Resetting simulation with save name: ${saveName}`);
            
            // Stop any running simulation
            if (this.currentMainLoop) {
                window.cancelAnimationFrame(this.currentMainLoop);
                this.currentMainLoop = null;
            }
            
            // Reset game state
            this.gameState = {
                isRunning: false,
                isPaused: false,
                saveName: saveName,
                createdAt: new Date().toISOString(),
                lastSaved: null
            };
            
            // Reinitialize the grid
            await this.initializeSimulationGrid();
            
            logger.log('Simulation reset successfully', 'info');
            return true;
            
        } catch (error) {
            logger.error('Failed to reset simulation:', error);
            throw error;
        }
    }
}

// Export a singleton instance
export const app = new App();
