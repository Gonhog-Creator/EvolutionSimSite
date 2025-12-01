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
        
        // Set app reference in selection manager
        if (this.selectionManager) {
            this.selectionManager.app = this;
        }
        
        // Setup temperature adjustment handler
        this.selectionManager.onTemperatureAdjust = (x, y, isDecrease = false) => {
            if (this.isAdmin) {
                const currentTemp = this.temperatureManager.getTemperature(x, y);
                const change = isDecrease ? -10 : 10;
                const newTemp = currentTemp + change;
                this.temperatureManager.setTemperature(x, y, newTemp);
            }
            // No logging of temperature changes
        };
        
        // Initialize Save Manager with fallback to JavaScript implementation
        this.saveManager = saveManager.getInstance({ useFallback: true });
        
        // Initialize UI Manager with reference to this app instance
        this.uiManager = new UIManager(this);
        
        // Initialize diagnostics channel
        this.diagChannel = null;
        this.setupDiagnostics();
        
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
                this.togglePause(false); // Don't show menu, just show banner
                e.preventDefault(); // Prevent scrolling the page
                e.stopPropagation(); // Stop event bubbling
            }
        };
        
        // Add event listener for keydown events
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
            
            // Wait for WebAssembly to be ready and get the module
            const wasmModule = await this.waitForWasmReady();
            
            // Initialize components that depend on WebAssembly
            this.onWasmReady(wasmModule);
            
            // Initialize WebAssembly module if needed
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
            this.saveManager = saveManager.getInstance(wasmModule);
        }
        
        // Initialize any WebAssembly-dependent components
        if (this.temperatureManager && typeof this.temperatureManager.initialize === 'function') {
            this.temperatureManager.initialize();
        }
    }

    async init() {
        logger.log('Initializing application...');
        
        try {
            // Initialize UI Manager
            this.uiManager = new UIManager(this);
            
            // Initialize diagnostics
            this.diagChannel = new DiagnosticsChannel();
            
            // Initialize save manager with fallback
            this.saveManager = saveManager.getInstance({ useFallback: true });
            
            // Try to initialize WebAssembly
            await this.initializeWasm();
            
            // Other initializations...
            
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
            return;
        }
        
        logger.log('Initializing WebAssembly...');
        
        try {
            const wasmModule = await this.waitForWasmReady();
            if (wasmModule) {
                this.saveManager.setWasmModule(wasmModule);
                logger.log('WebAssembly module initialized successfully');
            } else {
                throw new Error('Failed to initialize WebAssembly module');
            }
        } catch (error) {
            logger.error('Error initializing WebAssembly:', error);
            this.saveManager._useFallback = true;
            logger.warn('Falling back to JavaScript implementation');
        }
    }

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
                try {
                    // Safely update temperature system
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
                    
                    // Draw temperature overlay if enabled and render method exists
                    if (this.showTemperature && 
                        typeof this.temperatureManager.render === 'function') {
                        this.temperatureManager.render(ctx, this.grid?.cellSize || 20, this.showTemperature);
                    }
                } catch (error) {
                    console.error('Error in temperature system:', error);
                }
            }
            
            // Draw the grid
            await this.drawGrid(ctx, canvas.width, canvas.height);
            
            // Draw selection and hover effects
            if (this.selectionManager) {
                this.selectionManager.render(ctx);
                
                // Update debug overlay with selected cell info
                let cellInfo = null;
                const selectedCell = this.selectionManager.getSelectedCell();
                if (selectedCell && this.temperatureManager) {
                    const temp = this.temperatureManager.getTemperature(selectedCell.x, selectedCell.y);
                    cellInfo = { 
                        temp,
                        x: selectedCell.x,
                        y: selectedCell.y
                    };
                }
                
                if (this.uiManager && this.uiManager.updateDebugOverlay) {
                    this.uiManager.updateDebugOverlay(timestamp, cellInfo);
                }
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
        // Create or update the admin container
        if (!this.adminContainer) {
            // Create a container for admin UI elements
            this.adminContainer = document.createElement('div');
            this.adminContainer.id = 'admin-container';
            this.adminContainer.style.position = 'fixed';
            this.adminContainer.style.top = '10px';
            this.adminContainer.style.right = '10px';
            this.adminContainer.style.display = 'flex';
            this.adminContainer.style.flexDirection = 'column';
            this.adminContainer.style.gap = '5px';
            this.adminContainer.style.zIndex = '1000';
            document.body.appendChild(this.adminContainer);
            
            // Create the admin indicator
            this.adminIndicator = document.createElement('div');
            this.adminIndicator.id = 'admin-indicator';
            this.adminIndicator.style.padding = '5px 10px';
            this.adminIndicator.style.borderRadius = '4px';
            this.adminIndicator.style.fontFamily = 'monospace';
            this.adminIndicator.style.fontWeight = 'bold';
            this.adminIndicator.textContent = 'ADMIN MODE';
            this.adminContainer.appendChild(this.adminIndicator);
            
            // Create the brush button
            this.adminBrushButton = document.createElement('button');
            this.adminBrushButton.id = 'admin-brush-button';
            this.updateBrushButtonText();
            this.adminBrushButton.style.padding = '5px 10px';
            this.adminBrushButton.style.borderRadius = '4px';
            this.adminBrushButton.style.border = '1px solid #ccc';
            this.adminBrushButton.style.cursor = 'pointer';
            this.adminBrushButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectionManager) {
                    this.selectionManager.toggleBrushSize();
                    this.updateBrushButtonText();
                    logger.log(`Brush size toggled to ${this.selectionManager.brushSize === 0 ? '1x1' : '5x5 circle'}`);
                }
            });
            this.adminContainer.appendChild(this.adminBrushButton);
        }
        
        // Update visibility based on admin mode
        if (this.isAdmin) {
            this.adminContainer.style.display = 'flex';
            this.adminIndicator.style.display = 'block';
            this.adminBrushButton.style.display = 'block';
            
            // Set admin mode on selection manager
            if (this.selectionManager) {
                this.selectionManager.isAdmin = true;
            }
            
            // Admin key handling is now managed by UIManager
        } else {
            this.adminContainer.style.display = 'none';
            this.adminIndicator.style.display = 'none';
            this.adminBrushButton.style.display = 'none';
            
            // Admin key handling is now managed by UIManager
            
            // Reset selection manager admin state
            if (this.selectionManager) {
                this.selectionManager.isAdmin = false;
                this.selectionManager.brushSize = 0; // Reset brush size when exiting admin mode
            }
        }
    }
    
    /**
     * Sets the current brush mode
     * @param {string} mode - The brush mode to set
     */
    setBrushMode(mode) {
        if (this.selectionManager) {
            this.selectionManager.setBrushMode(mode);
        }
    }

    /**
     * Toggles the temperature overlay
     */
    toggleTemperatureOverlay() {
        if (this.temperatureManager) {
            this.showTemperature = !this.showTemperature;
            logger.log(`Temperature overlay ${this.showTemperature ? 'enabled' : 'disabled'}`);
            return true;
        }
        return false;
    }

    /**
     * Updates the brush button text based on current brush size
     */
    updateBrushButtonText() {
        if (this.adminBrushButton && this.selectionManager) {
            this.adminBrushButton.textContent = `Brush: ${this.selectionManager.brushSize === 0 ? '1x1' : '5x5'}`;
            this.adminBrushButton.style.backgroundColor = this.selectionManager.brushSize === 0 ? '#f0f0f0' : '#4CAF50';
            this.adminBrushButton.style.color = this.selectionManager.brushSize === 0 ? '#000' : '#fff';
        }
    }

    /**
     * Waits for the WebAssembly module to be ready
     * @returns {Promise<Object|null>} The WebAssembly module or null if not available
     */
    async waitForWasmReady() {
        return new Promise((resolve, reject) => {
            // First check if we already have the module ready
            if (window.wasmReady && window.Module) {
                logger.log('WebAssembly already initialized');
                resolve(window.Module);
                return;
            }
            
            logger.log('Waiting for WebAssembly to be ready...');
            
            const timeout = setTimeout(() => {
                const error = new Error('WebAssembly initialization timed out after 30 seconds');
                logger.error(error.message);
                
                // Log additional debug information
                if (window.Module) {
                    const moduleInfo = {
                        status: window.Module.status,
                        error: window.Module.error,
                        hasAsm: !!window.Module.asm,
                        hasRuntimeInitialized: !!window.Module.onRuntimeInitialized,
                        exports: window.Module.asm ? Object.keys(window.Module.asm) : []
                    };
                    logger.error('WebAssembly Module state:', moduleInfo);
                    console.log('WebAssembly Module object:', window.Module);
                } else {
                    logger.error('window.Module is not defined');
                }
                
                // Even if we time out, try to resolve with what we have
                resolve(window.Module || null);
            }, 30000); // 30 second timeout
            
            // Function to complete initialization
            const completeInitialization = (module) => {
                clearTimeout(timeout);
                logger.log('WebAssembly initialization complete');
                
                // Set up the save manager with the WebAssembly module
                try {
                    if (module) {
                        logger.log('Setting up save manager with WebAssembly module');
                        this.saveManager.setWasmModule(module);
                    } else {
                        logger.warn('No WebAssembly module provided, using fallback save system');
                    }
                    resolve(module);
                } catch (error) {
                    logger.error('Error initializing save manager:', error);
                    resolve(null); // Resolve with null to continue without WebAssembly
                }
            };
            
            // Check if the module is already ready
            if (window.Module) {
                if (window.Module.asm) {
                    return completeInitialization(window.Module);
                }
                
                // If not ready, wait for onRuntimeInitialized
                const originalInit = window.Module.onRuntimeInitialized;
                window.Module.onRuntimeInitialized = () => {
                    if (originalInit) originalInit();
                    completeInitialization(window.Module);
                };
            } else {
                // Listen for the wasm-ready event as a fallback
                const onWasmReady = () => {
                    document.removeEventListener('wasm-ready', onWasmReady);
                    completeInitialization(window.Module);
                };
                
                document.addEventListener('wasm-ready', onWasmReady);
                
                // Also check periodically in case the event was missed
                const checkReady = setInterval(() => {
                    if (window.Module) {
                        clearInterval(checkReady);
                        completeInitialization(window.Module);
                    }
                }, 100);
            }
        });
    }

    /**
     * Shows the new game modal to get the save name
     */
    startNewGame() {
        logger.log('Showing new game modal...');
        this.uiManager.showNewGameModal();
    }

    /**
     * Hides the new game modal
     */
    hideNewGameModal() {
        this.uiManager.hideNewGameModal();
    }

    showMainMenu() {
        this.uiManager.showMainMenu();
    }

    hideMainMenu() {
        this.uiManager.hideMainMenu();
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
            this.hideSaveManager();
            this.hideMainMenu();
            
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

        // Show debug overlay when game starts
        if (this.uiManager) {
            this.uiManager.showDebugOverlay();
        }

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
 * @param {boolean} showMenu - Whether to show the pause menu (default: false)
 */
togglePause(showMenu = false) {
    if (!this.isRunning) return;
    
    // Delegate to UIManager for all pause/resume functionality
    if (this.isPaused) {
        if (showMenu) {
            // Toggle menu visibility through UIManager
            this.uiManager.togglePauseMenu();
        } else {
            // Spacebar - resume the game
            this.uiManager.resumeSimulation();
        }
    } else {
        // Pause the game and show menu if requested
        this.uiManager.pauseSimulation(showMenu);
    }
}

/**
 * Resumes the simulation from a paused state
 */
resumeSimulation() {
    // Update state first
    this.isPaused = false;
    
    // Resume the simulation loop if available
    if (window.Module) {
        if (typeof window.Module._emscripten_resume_main_loop === 'function') {
            window.Module._emscripten_resume_main_loop();
        } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
            window.Module.asm._emscripten_resume_main_loop();
        }
    }
    
    // Hide pause UI elements
    if (this.uiManager) {
        this.uiManager.hidePauseBanner && this.uiManager.hidePauseBanner();
        this.uiManager.hidePauseMenu && this.uiManager.hidePauseMenu();
    }
    
    // Force update the hovered cell and tooltip
    if (this.selectionManager) {
        this.selectionManager.forceUpdateHoveredCell();
        
        // Also dispatch a mouse move event for any other listeners
        if (this.selectionManager.lastMouseEvent && this.selectionManager.canvas) {
            const newEvent = new MouseEvent('mousemove', {
                clientX: this.selectionManager.lastMouseEvent.clientX,
                clientY: this.selectionManager.lastMouseEvent.clientY,
                bubbles: true,
                cancelable: true,
                view: window
            });
            this.selectionManager.canvas.dispatchEvent(newEvent);
        }
    }

    logger.log('Simulation resumed');
}

/**
 * Forces a mouse move event to update the selected cell
 TODO: fix mouse update for closing esc menu, currently only forces update for pause state
 */
forceMouseMoveUpdate() {
    if (!this.selectionManager || !this.selectionManager.lastMouseEvent) return;
    
    // Get the last mouse event and canvas
    const lastEvent = this.selectionManager.lastMouseEvent;
    const canvas = this.selectionManager.canvas;
    if (!canvas) return;
    
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
            
            // Check if we have saved temperature data in the game state
            const savedTemperatureData = this.gameState?.temperatureData;
            
            // Log the saved temperature data for debugging
            logger.log('Initializing temperature system with data:', {
                hasSavedData: !!savedTemperatureData,
                savedWidth: savedTemperatureData?.width,
                savedHeight: savedTemperatureData?.height,
                currentWidth: width,
                currentHeight: height
            });
            
            try {
                // Initialize the temperature system with the current dimensions
                await this.temperatureManager.initialize(width, height);
                
                // If we have saved temperature data and the dimensions match, apply it
                if (savedTemperatureData && 
                    savedTemperatureData.width === width && 
                    savedTemperatureData.height === height) {
                    
                    logger.log('Applying saved temperature data');
                    this.temperatureManager.setTemperatureData(savedTemperatureData);
                } else if (savedTemperatureData) {
                    logger.warn('Saved temperature data dimensions do not match current grid', {
                        savedWidth: savedTemperatureData.width,
                        savedHeight: savedTemperatureData.height,
                        currentWidth: width,
                        currentHeight: height
                    });
                } else {
                    logger.log('No saved temperature data found, using default temperature');
                }
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
     * Toggles temperature visualization on/off
     */
    
    /**
     * Gets a color for a temperature value
     * @param {number} temp - Temperature value
     * @returns {string} CSS color string
     */
    getTemperatureColor(temp) {
        const { minTemp, maxTemp } = this.temperatureSettings || { minTemp: 0, maxTemp: 100 };
        
        // Normalize temperature to 0-1 range
        const range = maxTemp - minTemp;
        let t = range !== 0 ? (temp - minTemp) / range : 0.5;
        t = Math.max(0, Math.min(1, t)); // Clamp to 0-1
        
        // Create gradient from blue (cold) to red (hot)
        const r = Math.round(t * 255);
        const b = Math.round((1 - t) * 255);
        
        return `rgb(${r}, 0, ${b})`;
    }

    /**
     * Handles the Resume button click from the pause menu
     */
    onResumeClick() {
        logger.log('Resume clicked');
        this.resumeSimulation();
    }

    /**
     * Handles the Save Game button click from the pause menu
     */
    async onSaveGameClick() {
        logger.log('Save Game clicked');
        
        try {
            if (!this.gameState) {
                throw new Error('No game state to save');
            }
            
            // Ensure we have a save manager instance with fallback enabled
            this.saveManager = saveManager.getInstance({ 
                useFallback: true,  // Always use fallback to ensure save works
                wasmModule: window.Module  // Pass the module if available
            });
            
            // If we're not using fallback but don't have a WebAssembly module, try to initialize it
            if (!this.saveManager._useFallback && !this.saveManager._wasmModule) {
                try {
                    logger.log('WebAssembly module not loaded, attempting to initialize...');
                    const wasmModule = await this.waitForWasmReady();
                    if (wasmModule) {
                        this.saveManager.setWasmModule(wasmModule);
                    } else {
                        throw new Error('Failed to initialize WebAssembly module');
                    }
                } catch (error) {
                    logger.warn('Error initializing WebAssembly, using fallback:', error);
                    this.saveManager._useFallback = true;
                }
            }
            
            // Include temperature data in the game state
            if (this.temperatureManager) {
                // Get temperature data with proper structure
                const tempData = this.temperatureManager.getTemperatureData();
                if (tempData) {
                    this.gameState.temperatureData = tempData;
                    logger.log('Saving temperature data:', {
                        width: tempData.width,
                        height: tempData.height,
                        hasCells: tempData.cells && tempData.cells.length > 0 && tempData.cells[0].length > 0
                    });
                } else {
                    logger.warn('Failed to get temperature data for saving');
                }
            }
            
            // Get the save name, default to 'My Game' if not set
            const saveName = this.gameState.saveName || 'My Game';
            const saveId = this.gameState.saveId || null;
            
            // Prepare the game state for saving
            const gameStateToSave = {
                ...this.gameState,
                // Include the temperature system for saving
                temperatureSystem: this.temperatureManager,
                // Add any additional state that should be saved
                timestamp: Date.now(),
                version: '1.0.0'
            };
            
            // Save the game using the save manager
            const savedGame = await this.saveManager.saveGame(gameStateToSave, saveName, saveId);
            
            // Update the game state with the save ID if it's a new save
            if (!saveId && savedGame && savedGame.id) {
                this.gameState.saveId = savedGame.id;
                this.gameState.saveName = savedGame.name;
            }
            
            this.uiManager.showNotification('Game saved successfully!');
            logger.log('Game saved successfully', { saveId: savedGame?.id, saveName });
            
            return savedGame;
        } catch (error) {
            logger.error('Error saving game:', error);
            this.uiManager.showNotification('Failed to save game. Please try again.');
            throw error;
        }
    }
    
    /**
     * Handles the Save & Quit button click from the pause menu
     */
    async onSaveAndQuitClick() {
        logger.log('Save & Quit clicked');
        
        try {
            // Initialize save manager with fallback enabled
            this.saveManager = saveManager.getInstance({ 
                useFallback: true,  // Always use fallback to ensure save works
                wasmModule: window.Module  // Pass the module if available
            });
            
            // First save the game
            const savedGame = await this.onSaveGameClick();
            
            if (savedGame) {
                // Only quit if save was successful
                await this.onQuitToMenuClick();
                logger.log('Successfully saved and returned to main menu');
                return true;
            } else {
                throw new Error('Failed to save game');
            }
        } catch (error) {
            logger.error('Error during save & quit:', error);
            
            // If the error is related to WebAssembly, try again with fallback
            if (error.message.includes('WebAssembly') && this.saveManager && !this.saveManager._useFallback) {
                logger.warn('Retrying save & quit with fallback save system');
                this.saveManager._useFallback = true;
                return this.onSaveAndQuitClick();
            }
            
            // If we're already using fallback or it's a different error, show error to user
            if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                this.uiManager.showNotification('Failed to save game. Your progress may not be saved.');
            }
            throw error;
        }
    }

    /**
     * Handles the Quit to Menu button click from the pause menu
     * This will quit to the main menu without saving
     */
    async onQuitToMenuClick() {
        logger.log('Quit to Menu clicked');
        
        try {
            // Update game state
            this.isRunning = false;
            this.isPaused = false;
            
            // Hide game UI elements
            if (this.uiManager) {
                this.uiManager.hidePauseBanner();
                this.uiManager.hidePauseMenu();
                this.uiManager.hideDebugOverlay();
                this.uiManager.showMainMenu();
            }
            
            // Hide the selection tooltip if it's visible
            if (this.selectionManager) {
                this.selectionManager.hideTooltip();
            }
            
            // Stop any running animation frame
            if (this.currentMainLoop) {
                cancelAnimationFrame(this.currentMainLoop);
                this.currentMainLoop = null;
            }
            
            logger.log('Successfully returned to main menu');
            this.uiManager.showNotification('Returned to main menu');
            
            return true;
        } catch (error) {
            logger.error('Error quitting to menu:', error);
            this.uiManager.showNotification('Error returning to main menu');
            throw error;
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
            
            // Log the new game state after reset
            logger.log('Game state after reset:', {
                hasTemperatureData: !!this.gameState.temperatureData,
                grid: this.gameState.grid || 'No grid data'
            });

            // Reinitialize the grid
            await this.initializeSimulationGrid();

            // Reapply temperature data if it exists and we have valid grid dimensions
            if (temperatureData && gridDimensions && gridDimensions.width && gridDimensions.height) {
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
}

// Export a singleton instance
export const app = new App();
