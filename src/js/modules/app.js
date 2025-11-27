import { logger } from './logger.js';
import { saveManager } from './saveManager.js';

class App {
    constructor() {
        this.isInitialized = false;
        this.isInitializing = false;
        this.wasmInitializationPromise = null;
        this.currentMainLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        this.diagChannel = null;
        this.gameState = null;
        this.elements = {};
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
            
            this.initializeElements();
            this.setupButtonListeners();
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

    initializeElements() {
        this.elements = {
            gameContainer: document.getElementById('game-container'),
            mainMenu: document.getElementById('main-menu'),
            newGameBtn: document.getElementById('new-game-btn'),
            loadGameBtn: document.getElementById('load-game-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            pauseMenu: document.getElementById('pause-menu'),
            resumeBtn: document.getElementById('resume-btn'),
            saveGameBtn: document.getElementById('save-game-btn'),
            settingsMenuBtn: document.getElementById('settings-menu-btn'),
            quitToMenuBtn: document.getElementById('quit-to-menu-btn')
        };
    }

    setupButtonListeners() {
        const { 
            newGameBtn, 
            loadGameBtn, 
            settingsBtn,
            resumeBtn,
            saveGameBtn,
            settingsMenuBtn,
            quitToMenuBtn
        } = this.elements;

        // Set up button event listeners
        // Main menu buttons
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.startNewGame());
        }
        
        if (loadGameBtn) {
            loadGameBtn.addEventListener('click', () => this.showSaveManager());
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showSettings());
        }
        
        // Pause menu buttons
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.onResumeClick());
        }
        
        if (saveGameBtn) {
            saveGameBtn.addEventListener('click', () => this.onSaveGameClick());
        }
        
        if (settingsMenuBtn) {
            settingsMenuBtn.addEventListener('click', () => this.onSettingsMenuClick());
        }
        
        if (quitToMenuBtn) {
            quitToMenuBtn.addEventListener('click', () => this.onQuitToMenuClick());
        }
        
        // Add keyboard event listener for ESC key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isRunning) {
                this.togglePause();
                event.preventDefault(); // Prevent default ESC behavior
            }
        });
    }

    setupDiagnostics() {
        try {
            this.diagChannel = new BroadcastChannel('evolution-sim-diag');
            this.broadcastLog('Game instance started', 'info');
            this.diagChannel.postMessage({ type: 'status', data: { connected: true } });
            
            window.addEventListener('beforeunload', () => {
                this.diagChannel.postMessage({ type: 'status', data: { connected: false } });
                this.diagChannel.close();
            });
        } catch (error) {
            logger.error('Failed to initialize diagnostics:', error);
        }
    }

    broadcastLog(message, type = 'info') {
        if (!this.diagChannel) return;
        
        try {
            this.diagChannel.postMessage({
                type: 'log',
                data: { message, type }
            });
        } catch (error) {
            logger.error('Failed to broadcast log:', error);
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

    async startNewGame() {
        logger.log('Starting new game...');
        
        try {
            // Make sure WebAssembly is loaded
            if (!window.Module) {
                logger.error('WebAssembly module not loaded');
                return;
            }
            
            // Initialize the game state
            logger.log('Initializing game state...');
            
            // Show the game container and hide the main menu and pause menu
            const { gameContainer, mainMenu, pauseMenu } = this.elements;
            if (gameContainer) gameContainer.classList.remove('hidden');
            if (mainMenu) mainMenu.classList.add('hidden');
            if (pauseMenu) pauseMenu.classList.add('hidden');
            
            // Reset the simulation first
            await this.resetSimulation();
            
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

    showSaveManager() {
        logger.log('Showing save manager...');
        // Implementation for showing save manager
    }

    loadGame(saveId) {
        logger.log(`Loading game with ID: ${saveId}`);
        // Implementation for loading a saved game
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
                throw new Error('Canvas element not found');
            }
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Could not get canvas context');
            }
            
            // Set up the animation loop
            const render = () => {
                if (!this.isRunning) return;
                
                // Clear the canvas
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw a simple grid for now
                this.drawGrid(ctx, canvas.width, canvas.height);
                
                // Continue the animation loop
                requestAnimationFrame(render);
            };
            
            // Start the render loop
            this.isRunning = true;
            render();
            
            logger.log('Render loop started', 'success');
            
        } catch (error) {
            logger.error('Failed to start simulation:', error);
            throw error;
        }
    }

    /**
     * Toggles the pause state of the simulation
     */
    togglePause() {
        if (!this.isRunning) return;
        
        this.isPaused = !this.isPaused;
        const { pauseMenu } = this.elements;
        
        if (this.isPaused) {
            // Pause the simulation
            if (window.Module) {
                if (typeof window.Module._emscripten_pause_main_loop === 'function') {
                    window.Module._emscripten_pause_main_loop();
                } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
                    window.Module.asm._emscripten_pause_main_loop();
                }
            }
            
            // Show pause menu
            if (pauseMenu) {
                pauseMenu.classList.remove('hidden');
            }
            
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
        
        // Hide pause menu
        const { pauseMenu } = this.elements;
        if (pauseMenu) {
            pauseMenu.classList.add('hidden');
        }
        
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
    onSaveGameClick() {
        logger.log('Saving game...');
        // TODO: Implement save game functionality
        // This will be implemented when we add the save system
        alert('Save game functionality coming soon!');
    }

    /**
     * Handles the Settings button click in the pause menu
     */
    onSettingsMenuClick() {
        logger.log('Opening settings...');
        // TODO: Implement settings menu
        alert('Settings menu coming soon!');
    }

    /**
     * Handles the Quit to Menu button click in the pause menu
     */
    onQuitToMenuClick() {
        logger.log('Quitting to main menu...');
        this.resetSimulation();
        
        // Show main menu and hide game container
        const { gameContainer, mainMenu } = this.elements;
        if (gameContainer) gameContainer.classList.add('hidden');
        if (mainMenu) mainMenu.classList.remove('hidden');
        
        // Reset states
        this.isRunning = false;
        this.isPaused = false;
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
            
            // Initialize some random food
            this.initializeRandomFood(50); // Start with 50 food items
            
        } catch (error) {
            logger.error('Failed to initialize simulation grid:', error);
            throw error;
        }
    }
    
    /**
     * Initializes random food items on the grid
     * @param {number} count - Number of food items to create
     */
    initializeRandomFood(count) {
        if (!this.grid || !this.grid.cells.length) {
            logger.warn('Grid not initialized, cannot add food');
            return;
        }
        
        let placed = 0;
        const maxAttempts = count * 2;
        let attempts = 0;
        
        while (placed < count && attempts < maxAttempts) {
            attempts++;
            
            const x = Math.floor(Math.random() * this.grid.width);
            const y = Math.floor(Math.random() * this.grid.height);
            
            if (x >= 0 && x < this.grid.width && y >= 0 && y < this.grid.height) {
                const cell = this.grid.cells[y][x];
                if (cell.type === 'empty') {
                    cell.type = 'food';
                    cell.energy = 10; // Each food gives 10 energy
                    placed++;
                }
            }
        }
        
        logger.log(`Placed ${placed} food items on the grid`);
    }
    
    /**
     * Draws the simulation grid
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    drawGrid(ctx, width, height) {
        if (!this.grid) return;
        
        const { cellSize } = this.grid;
        
        // Draw grid lines
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        
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
    }
    
    async resetSimulation() {
        logger.log('Resetting simulation...');
        
        try {
            // Stop any running simulation
            this.isRunning = false;
            
            // Clear the canvas
            const canvas = document.querySelector('canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
            
            // Reset the WebAssembly module if available
            if (window.Module) {
                // Try different ways to stop the main loop
                if (typeof window.Module._emscripten_cancel_main_loop === 'function') {
                    window.Module._emscripten_cancel_main_loop();
                } 
                else if (window.Module.asm && window.Module.asm._emscripten_cancel_main_loop) {
                    window.Module.asm._emscripten_cancel_main_loop();
                }
                
                // Reset the module state if possible
                if (window.Module.asm && typeof window.Module.asm._reset === 'function') {
                    window.Module.asm._reset();
                } 
                else if (typeof window.Module._reset === 'function') {
                    window.Module._reset();
                }
            }
            
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
