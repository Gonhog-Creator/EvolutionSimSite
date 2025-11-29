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
        this.gameState = null;
        this.elements = {};
        
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
            saveQuitBtn: document.getElementById('save-quit-btn'),
            settingsMenuBtn: document.getElementById('settings-menu-btn'),
            quitToMenuBtn: document.getElementById('quit-to-menu-btn'),
            newGameModal: document.getElementById('new-game-modal'),
            saveNameInput: document.getElementById('save-name'),
            closeNewGameBtn: document.getElementById('close-new-game'),
            cancelNewGameBtn: document.getElementById('cancel-new-game'),
            confirmNewGameBtn: document.getElementById('confirm-new-game')
        };
    }

    setupButtonListeners() {
        const { 
            newGameBtn, 
            loadGameBtn, 
            settingsBtn,
            resumeBtn,
            saveGameBtn,
            saveQuitBtn,
            settingsMenuBtn,
            quitToMenuBtn,
            newGameModal,
            closeNewGameBtn,
            cancelNewGameBtn,
            confirmNewGameBtn,
            saveNameInput
        } = this.elements;
        
        // New game modal handlers
        if (closeNewGameBtn) {
            closeNewGameBtn.addEventListener('click', () => this.hideNewGameModal());
        }
        
        if (cancelNewGameBtn) {
            cancelNewGameBtn.addEventListener('click', () => this.hideNewGameModal());
        }
        
        if (confirmNewGameBtn) {
            confirmNewGameBtn.addEventListener('click', () => this.confirmNewGame());
        }
        
        // Close modal when clicking outside the content
        if (newGameModal) {
            newGameModal.addEventListener('click', (e) => {
                if (e.target === newGameModal) {
                    this.hideNewGameModal();
                }
            });
            
            // Handle Enter key in the save name input
            if (saveNameInput) {
                saveNameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.confirmNewGame();
                    }
                });
            }
        }

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
        
        if (saveQuitBtn) {
            saveQuitBtn.addEventListener('click', () => this.onSaveAndQuitClick());
        }
        
        if (settingsMenuBtn) {
            settingsMenuBtn.addEventListener('click', () => this.showSettings());
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
        const { newGameModal, saveNameInput } = this.elements;
        
        if (!newGameModal) {
            console.error('New game modal element not found');
            return;
        }
        
        // Show the modal by removing the 'hidden' class first
        newGameModal.classList.remove('hidden');
        newGameModal.style.display = 'flex';
        
        // Reset input value and focus state
        if (saveNameInput) {
            saveNameInput.value = ''; // Clear any previous input
        }
        
        // Small delay to ensure the modal is visible before focusing
        setTimeout(() => {
            // Set opacity and visibility with a small delay for the transition
            newGameModal.style.opacity = '1';
            newGameModal.style.visibility = 'visible';
            
            // Focus and select the input field
            if (saveNameInput) {
                saveNameInput.focus();
                saveNameInput.select();
            }
        }, 10);
        
        // Prevent scrolling when modal is open
        document.body.style.overflow = 'hidden';
        
        // Set up keyboard event listener for ESC key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.hideNewGameModal();
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        this._newGameModalKeyHandler = handleKeyDown;
        
        // Close when clicking outside the modal content
        newGameModal.onclick = (e) => {
            if (e.target === newGameModal) {
                this.hideNewGameModal();
            }
        };
        
        // Set up close and cancel buttons
        const closeBtn = document.getElementById('close-new-game');
        const cancelBtn = document.getElementById('cancel-new-game');
        
        if (closeBtn) closeBtn.onclick = () => this.hideNewGameModal();
        if (cancelBtn) cancelBtn.onclick = () => this.hideNewGameModal();
    }
    
    hideNewGameModal() {
        const { newGameModal, closeNewGameBtn, cancelNewGameBtn } = this.elements;
        if (!newGameModal) return;
        
        // Fade out the modal
        newGameModal.style.opacity = '0';
        
        // After the fade out completes, hide the modal
        setTimeout(() => {
            newGameModal.style.visibility = 'hidden';
            newGameModal.classList.add('hidden');
            
            // Re-enable scrolling
            document.body.style.overflow = 'auto';
        }, 200); // Match this with your CSS transition duration
        
        // Remove the keydown event listener if it exists
        if (this._newGameModalKeyHandler) {
            document.removeEventListener('keydown', this._newGameModalKeyHandler);
            this._newGameModalKeyHandler = null;
        }
        if (closeNewGameBtn) closeNewGameBtn.onclick = null;
        if (cancelNewGameBtn) cancelNewGameBtn.onclick = null;
        
        // Hide the modal with animation
        newGameModal.style.opacity = '0';
        newGameModal.style.visibility = 'hidden';
        
        // Re-enable scrolling
        document.body.style.overflow = '';
        
        // Remove the modal from the DOM after the animation completes
        setTimeout(() => {
            newGameModal.style.display = 'none';
        }, 300); // Match this with your CSS transition duration
    }
    
    async confirmNewGame() {
        const { saveNameInput } = this.elements;
        let saveName = saveNameInput ? saveNameInput.value.trim() : 'My Game';
        
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
            
            // Show the game container and hide the main menu and pause menu
            const { gameContainer, mainMenu, pauseMenu } = this.elements;
            if (gameContainer) gameContainer.classList.remove('hidden');
            if (mainMenu) mainMenu.classList.add('hidden');
            if (pauseMenu) pauseMenu.classList.add('hidden');
            
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
        // Reset any existing game state
        this.gameState = this.gameState || {};
        this.gameState.saveId = null; // Clear any existing save ID
        this.showNewGameModal();
    }

    /**
     * Shows the save manager modal with a list of saved games
     */
    showSaveManager() {
        const saveManagerModal = document.getElementById('save-manager-modal');
        const closeBtn = document.getElementById('close-save-manager');
        
        if (!saveManagerModal || !closeBtn) {
            console.error('Save manager modal elements not found');
            return;
        }
        
        // Show the modal
        saveManagerModal.classList.remove('hidden');
        saveManagerModal.style.display = 'flex';
        saveManagerModal.style.opacity = '1';
        saveManagerModal.style.visibility = 'visible';
        
        // Prevent scrolling when modal is open
        document.body.style.overflow = 'hidden';
        
        // Add ESC key handler
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.hideSaveManager();
            }
        };
        
        // Add event listeners
        document.addEventListener('keydown', handleKeyDown);
        closeBtn.onclick = () => this.hideSaveManager();
        
        // Store the keydown handler for cleanup
        saveManagerModal._keyDownHandler = handleKeyDown;
        
        // Load and display saved games
        this.refreshSaveList();
    }
    
    /**
     * Hides the save manager modal
     */
    hideSaveManager() {
        const saveManagerModal = document.getElementById('save-manager-modal');
        if (!saveManagerModal) return;
        
        // Remove the keydown event listener if it exists
        if (saveManagerModal._keyDownHandler) {
            document.removeEventListener('keydown', saveManagerModal._keyDownHandler);
            delete saveManagerModal._keyDownHandler;
        }
        
        // Remove the close button event listener
        const closeBtn = document.getElementById('close-save-manager');
        if (closeBtn) {
            closeBtn.onclick = null;
        }
        
        // Hide the modal with animation
        saveManagerModal.style.opacity = '0';
        saveManagerModal.style.visibility = 'hidden';
        
        // Reset body overflow
        document.body.style.overflow = '';
        
        // Remove the modal from the DOM after the animation completes
        setTimeout(() => {
            saveManagerModal.style.display = 'none';
        }, 300); // Match this with your CSS transition duration
    }
    
    /**
     * Refreshes the list of saved games in the save manager modal
     */
    refreshSaveList() {
        const savesList = document.getElementById('saves-list');
        if (!savesList) return;
        
        const saves = saveManager.getSaves();
        
        // Clear the current list
        savesList.innerHTML = '';
        
        if (saves.length === 0) {
            const noSaves = document.createElement('div');
            noSaves.className = 'no-saves';
            noSaves.textContent = 'No saved games found';
            savesList.appendChild(noSaves);
            return;
        }
        
        // Add each save to the list
        saves.forEach((save, index) => {
            const saveItem = document.createElement('div');
            saveItem.className = 'save-item';
            saveItem.dataset.saveId = save.id;
            
            const saveDate = new Date(save.timestamp);
            const formattedDate = saveDate.toLocaleString();
            
            saveItem.innerHTML = `
                <div class="save-info">
                    <h3>${save.name || 'Unnamed Save'}</h3>
                    <div class="save-meta">
                        <span><i>📅</i> ${formattedDate}</span>
                        <span><i>🔄</i> ${save.metadata?.turnCount || 0} turns</span>
                        <span><i>🧬</i> ${save.metadata?.creatureCount || 0} creatures</span>
                    </div>
                </div>
                <div class="save-actions">
                    <button class="load-btn" data-save-id="${save.id}">Load</button>
                    <button class="delete-btn" data-save-id="${save.id}">Delete</button>
                </div>
            `;
            
            // Add event listeners for the buttons
            const loadBtn = saveItem.querySelector('.load-btn');
            const deleteBtn = saveItem.querySelector('.delete-btn');
            
            if (loadBtn) {
                loadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadGame(save.id);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showConfirmationModal(save);
                });
            }
            
            // Add click handler to the entire save item
            saveItem.addEventListener('click', () => {
                // Toggle selection
                document.querySelectorAll('.save-item').forEach(item => {
                    item.classList.remove('selected');
                });
                saveItem.classList.add('selected');
            });
            
            savesList.appendChild(saveItem);
        });
        
        // Add event listener for the close button
        const closeBtn = document.getElementById('close-save-manager');
        if (closeBtn) {
            closeBtn.onclick = () => {
                this.hideSaveManager();
            };
        }
        
        // Close when clicking outside the modal content
        const modal = document.getElementById('save-manager-modal');
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.hideSaveManager();
                }
            };
        }
    }

    /**
     * Shows a confirmation dialog before deleting a save
     * @param {Object} save - The save object to be deleted
     */
    showConfirmationModal(save) {
        const confirmationModal = document.getElementById('confirmation-modal');
        const message = document.getElementById('confirmation-message');
        const confirmBtn = document.getElementById('confirm-delete');
        const cancelBtn = document.getElementById('cancel-delete');
        const closeBtn = document.getElementById('close-confirmation');
        
        if (!confirmationModal || !message || !confirmBtn || !cancelBtn || !closeBtn) {
            console.error('Confirmation modal elements not found');
            return;
        }
        
        // Set the confirmation message
        message.textContent = `Are you sure you want to delete "${save.name || 'this save'}"?`;
        
        // Show the modal
        confirmationModal.classList.remove('hidden');
        confirmationModal.style.display = 'flex';
        confirmationModal.style.opacity = '1';
        confirmationModal.style.visibility = 'visible';
        
        // Store the save ID on the confirm button for later use
        confirmBtn.dataset.saveId = save.id;
        
        // Set up event listeners
        const hideModal = () => {
            confirmationModal.style.opacity = '0';
            confirmationModal.style.visibility = 'hidden';
            setTimeout(() => {
                confirmationModal.style.display = 'none';
            }, 300);
            
            // Clean up event listeners
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
        };
        
        // Handle confirm button click
        confirmBtn.onclick = () => {
            const saveId = confirmBtn.dataset.saveId;
            if (saveId) {
                saveManager.deleteSave(saveId);
                this.refreshSaveList();
            }
            hideModal();
        };
        
        // Handle cancel and close button clicks
        const cancelHandler = () => hideModal();
        cancelBtn.onclick = cancelHandler;
        closeBtn.onclick = cancelHandler;
        
        // Close when clicking outside the modal content
        confirmationModal.onclick = (e) => {
            if (e.target === confirmationModal) {
                hideModal();
            }
        };
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
                alert('Failed to load saved game. The save file may be corrupted.');
                return;
            }
            
            // Hide the save manager modal
            this.hideSaveManager();
            
            // Reset the simulation with the loaded state
            await this.resetSimulation(savedState.saveName || 'Loaded Game');
            
            // Apply the loaded game state
            this.gameState = { ...this.gameState, ...savedState };
            
            // Start the simulation
            this.isRunning = true;
            this.isPaused = false;
            await this.startSimulation();
            
            logger.log('Game loaded successfully');
            
        } catch (error) {
            logger.error('Error loading game:', error);
            alert('An error occurred while loading the game. Please check the console for details.');
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
            this.showNotification('Error saving game. Changes may not be saved.');
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
            this.showNotification('Error: No active game to save');
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
                    logger.log('Game saved successfully:', updatedSave);
                    this.showNotification('Game saved successfully!');
                } else {
                    throw new Error('Failed to update save');
                }
            } else {
                // Create a new save with the current game name or a default name
                const saveName = this.gameState.saveName || `Game ${new Date().toLocaleString()}`;
                const newSave = saveManager.saveGame(gameState, saveName);
                if (newSave) {
                    // Store the save ID and name for future updates
                    this.gameState.saveId = newSave.id;
                    this.gameState.saveName = saveName; // Ensure name is stored for future saves
                    logger.log('New game saved:', newSave);
                    this.showNotification('New game saved successfully!');
                } else {
                    throw new Error('Failed to create new save');
                }
            }
        } catch (error) {
            logger.error('Error saving game:', error);
            this.showNotification('Error saving game: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Shows a notification message to the user
     * @param {string} message - The message to display
     * @param {number} [duration=3000] - How long to show the notification in milliseconds
     */
    showNotification(message, duration = 3000) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            notification.style.color = 'white';
            notification.style.padding = '10px 20px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '1000';
            notification.style.transition = 'opacity 0.3s ease-in-out';
            notification.style.opacity = '0';
            document.body.appendChild(notification);
        }
        
        // Set message and show
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // Auto-hide after duration
        clearTimeout(notification._hideTimeout);
        notification._hideTimeout = setTimeout(() => {
            notification.style.opacity = '0';
        }, duration);
    }
    
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
