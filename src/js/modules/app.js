import { logger } from './logger.js';
import { saveManager } from './saveManager.js';
import { UIManager } from './uiManager.js';
import { selectionManager } from './selectionManager.js';
import { temperatureManager } from './temperatureManager.js';

class App {
    constructor() {
        this.isInitialized = false;
        this.isInitializing = false;
        this.wasmInitializationPromise = null;
        this.currentMainLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        this.isAdmin = false; // Admin mode flag
        this.gameState = null;
        this.showTemperature = false; // Toggle for temperature visualization
        this.adminIndicator = null; // Will hold the admin indicator element
        
        // Initialize managers
        this.selectionManager = selectionManager;
        this.temperatureManager = temperatureManager;
        
        // Setup temperature adjustment handler
        this.selectionManager.onTemperatureAdjust = (x, y, isDecrease = false) => {
            if (this.isAdmin) {
                const currentTemp = this.temperatureManager.getTemperature(x, y);
                const change = isDecrease ? -10 : 10;
                const newTemp = currentTemp + change;
                this.temperatureManager.setTemperature(x, y, newTemp);
                const action = isDecrease ? 'Decreased' : 'Increased';
                logger.log(`${action} temperature at (${x}, ${y}) to ${newTemp.toFixed(1)}°C`);
            } else {
                logger.log('Temperature adjustment requires admin mode');
            }
        };
        
        // Initialize Save Manager
        this.saveManager = saveManager;
        
        // Initialize UI Manager with reference to this app instance
        this.uiManager = new UIManager(this);
        
        // Initialize diagnostics channel
        this.diagChannel = null;
        this.setupDiagnostics();
        
        // Bind keyboard events
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Initialize render method
        this.render = this.render.bind(this);
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

    /**
     * Main render loop
     * @param {number} timestamp - Current timestamp from requestAnimationFrame
     */
    async render(timestamp) {
        try {
            if (!this.lastRenderTime) {
                this.lastRenderTime = timestamp;
            }
            
            const deltaTime = timestamp - this.lastRenderTime;
            this.lastRenderTime = timestamp;
            
            // Get canvas context
            const canvas = document.querySelector('canvas');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Always update temperature system, but only render if enabled
            if (this.temperatureManager) {
                this.temperatureManager.update();
                
                // Update selection tooltip if hovering over a cell
                if (this.selectionManager) {
                    const hoveredCell = this.selectionManager.getHoveredCell();
                    if (hoveredCell) {
                        const temp = this.temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
                        this.selectionManager.updateTooltip(temp);
                    }
                }
                
                // Draw temperature overlay (pass the showTemperature flag)
                this.temperatureManager.render(ctx, this.grid?.cellSize || 20, this.showTemperature);
            }
            
            // Draw the grid
            await this.drawGrid(ctx, canvas.width, canvas.height);
            
            // Draw selection and hover effects
            if (this.selectionManager) {
                this.selectionManager.render(ctx);
            }
            
            // Continue the animation loop if running
            if (this.isRunning) {
                this.currentMainLoop = requestAnimationFrame(this.render.bind(this));
            }
        } catch (error) {
            logger.error('Error in render loop:', error);
            // Stop the animation loop on error
            this.isRunning = false;
            throw error;
        }
    }

    setupDiagnostics() {
        try {
            this.diagChannel = new BroadcastChannel('evolution-sim-diag');
            
            // Handle incoming messages
            this.diagChannel.onmessage = (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'command':
                        this.handleAdminCommand(data);
                        break;
                    case 'status':
                        // Handle status updates if needed
                        break;
                }
            };
            
            // Send initial status
            this.sendDiagMessage('status', { 
                connected: true,
                isAdmin: this.isAdmin,
                commands: [
                    'set admin true|false',
                    'getStatus'
                ]
            });
            
            // Set up a ping interval to keep the connection alive
            this.diagPingInterval = setInterval(() => {
                this.sendDiagMessage('status', { 
                    connected: true,
                    isAdmin: this.isAdmin
                });
            }, 10000); // Send status every 10 seconds
            
            // Send a welcome message
            this.sendDiagMessage('log', {
                message: 'Diagnostics channel initialized',
                type: 'info',
                isAdmin: this.isAdmin
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
                timestamp: new Date().toISOString(),
                data: {
                    ...data,
                    isAdmin: this.isAdmin // Always include admin status in messages
                }
            });
        } catch (error) {
            logger.error('Error sending diagnostic message:', error);
        }
    }
    
    /**
     * Handles admin commands from the diagnostic console
     * @param {Object} command - The command to handle
     * @param {string} command.type - The type of command
     * @param {any} command.data - Command data
     */
    handleAdminCommand(command) {
        if (!command || !command.type) return;
        
        // Only log the command type, not the full data
        logger.log(`Admin command: ${command.type} ${command.data?.key || ''}`);
        
        // Handle 'set' commands (e.g., 'set admin true')
        if (command.type === 'set' && command.data && command.data.key) {
            const { key, value } = command.data;
            
            switch (key.toLowerCase()) {
                case 'admin':
                    const adminState = String(value).toLowerCase() === 'true';
                    if (this.isAdmin !== adminState) {
                        this.toggleAdminMode();
                        // Only log the state change, not the command
                        logger.log(`Admin mode ${adminState ? 'enabled' : 'disabled'}`);
                    }
                    break;
                default:
                    logger.warn(`Unknown setting: ${key}`);
            }
            return;
        }
        
        // Handle other command types
        switch (command.type) {
            case 'getStatus':
                this.sendDiagMessage('status', {
                    isAdmin: this.isAdmin,
                    isRunning: this.isRunning,
                    isPaused: this.isPaused,
                    showTemperature: this.showTemperature
                });
                break;
            default:
                logger.warn(`Unknown admin command: ${command.type}`);
        }
    }
    
    /**
     * Toggles admin mode on/off
     */
    toggleAdminMode() {
        this.isAdmin = !this.isAdmin;
        
        // Update UI to show admin status
        this.updateAdminUI();
        
        // Log the change
        logger.log(`Admin mode ${this.isAdmin ? 'enabled' : 'disabled'}`);
        
        // Send updated status
        this.sendDiagMessage('adminStatus', { isAdmin: this.isAdmin });
    }
    
    /**
     * Updates the UI to reflect the current admin status
     */
    updateAdminUI() {
        // Create or update the admin indicator
        if (!this.adminIndicator) {
            this.adminIndicator = document.createElement('div');
            this.adminIndicator.id = 'admin-indicator';
            this.adminIndicator.style.position = 'fixed';
            this.adminIndicator.style.top = '10px';
            this.adminIndicator.style.right = '10px';
            this.adminIndicator.style.padding = '5px 10px';
            this.adminIndicator.style.borderRadius = '4px';
            this.adminIndicator.style.fontFamily = 'monospace';
            this.adminIndicator.style.fontWeight = 'bold';
            this.adminIndicator.style.zIndex = '1000';
            document.body.appendChild(this.adminIndicator);
        }
        
        if (this.isAdmin) {
            this.adminIndicator.textContent = 'ADMIN MODE';
            this.adminIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            this.adminIndicator.style.color = 'white';
            this.adminIndicator.style.display = 'block';
            
            // Add admin-specific keyboard shortcuts or UI elements here
            document.addEventListener('keydown', this.handleAdminKeyDown.bind(this));
        } else {
            this.adminIndicator.style.display = 'none';
            document.removeEventListener('keydown', this.handleAdminKeyDown.bind(this));
        }
    }
    
    /**
     * Handles keyboard shortcuts when in admin mode
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleAdminKeyDown(event) {
        if (!this.isAdmin) return;
        
        // Example: Toggle temperature overlay with T
        if (event.key.toLowerCase() === 't') {
            this.showTemperature = !this.showTemperature;
            logger.log(`Temperature overlay ${this.showTemperature ? 'enabled' : 'disabled'}`);
        }
        
        // Add more admin shortcuts as needed
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
            
            // If no initialization function was found, set up our own render loop
            logger.log('No initialization function found, setting up render loop...');
            
            // Set simulation state
            this.isRunning = true;
            this.isPaused = false;
            this.lastRenderTime = null;
            
            // Start the render loop
            this.currentMainLoop = requestAnimationFrame(this.render.bind(this));
            
            // Update UI if elements exist
            const { startBtn, pauseBtn } = this.uiManager.elements || {};
            if (startBtn) startBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
            
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
            
            // Stop any running simulation
            if (this.currentMainLoop) {
                window.cancelAnimationFrame(this.currentMainLoop);
                this.currentMainLoop = null;
            }
            
            // Reset game state
            this.isRunning = false;
            this.isPaused = false;
            
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
            const cellSize = 20; // Size of each grid cell in pixels
            const width = Math.ceil(canvas.width / cellSize);
            const height = Math.ceil(canvas.height / cellSize);
            
            this.grid = {
                cellSize,
                width,
                height,
                cells: []
            };
            
            // Initialize temperature system
            await this.temperatureManager.initialize(width, height, 20);
            
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
     * Toggles temperature visualization on/off
     */
    
    /**
     * Gets a color for a temperature value
     * @param {number} temp - Temperature value
     * @returns {string} CSS color string
     */
    getTemperatureColor(temp) {
        const { minTemp, maxTemp } = this.temperatureSettings;
        
        // Normalize temperature to 0-1 range
        let t = (temp - minTemp) / (maxTemp - minTemp);
        t = Math.max(0, Math.min(1, t)); // Clamp to 0-1
        
        // Create gradient from blue (cold) to red (hot)
        const r = Math.round(t * 255);
        const b = Math.round((1 - t) * 255);
        
        return `rgb(${r}, 0, ${b})`;
    }
    
    /**
     * Handles keyboard input
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyDown(event) {
        // Toggle temperature view with 't' key
        if (event.key.toLowerCase() === 't') {
            this.showTemperature = !this.showTemperature;
            logger.log(`Temperature view ${this.showTemperature ? 'enabled' : 'disabled'}`);
            
            // Update tooltip for hovered cell
            const hoveredCell = this.selectionManager.getHoveredCell();
            if (hoveredCell) {
                const temp = this.temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
                this.selectionManager.updateTooltip(temp);
            }
        }
    }
    
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
                if (!canvas) return false;
                
                ctx = canvas.getContext('2d');
                if (!ctx) return false;
                
                width = width || canvas.width;
                height = height || canvas.height;
                
                // Clear the canvas
                ctx.clearRect(0, 0, width, height);
            }
            
            // Set grid style
            const cellSize = this.grid?.cellSize || 20;
            ctx.strokeStyle = this.grid ? '#1a1a1a' : '#333333';
            ctx.lineWidth = this.grid ? 1 : 0.5;
            
            // Draw vertical grid lines
            for (let x = 0; x <= width; x += cellSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            
            // Draw horizontal grid lines
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
