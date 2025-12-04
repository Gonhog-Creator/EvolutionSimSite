import { logger } from '../utils/logger.js';

export class UIManager {
    constructor(app) {
        this.app = app;
        this.elements = {};
        this.fps = 0;
        this.lastTime = performance.now();
        this.frames = 0;
        this.simulationTime = 0;
        this.lastUpdateTime = 0;
        this.debugOverlay = null;
        
        // Initialize key handlers
        this.keyHandlers = {
            'Escape': this.handleEscapeKey.bind(this),
            't': this.toggleTemperatureOverlay.bind(this),
            'T': this.toggleTemperatureOverlay.bind(this)
        };
        
        // Initialize empty admin key bindings
        this.adminKeyHandlers = {};
        
        // Bind methods
        this.handleEscapeKey = this.handleEscapeKey.bind(this);
        this.toggleTemperatureOverlay = this.toggleTemperatureOverlay.bind(this);
        
        // Store saveManager reference with error handling
        if (app && app.saveManager) {
            this.saveManager = app.saveManager;
        } else {
            console.error('SaveManager not available in UIManager constructor');
            // Create a mock saveManager with minimal functionality to prevent errors
            this.saveManager = {
                getSaves: () => {
                    console.warn('Using mock saveManager - no saves available');
                    return [];
                },
                saveGame: () => {
                    console.warn('Using mock saveManager - save failed');
                    return null;
                },
                loadGame: () => {
                    console.warn('Using mock saveManager - load failed');
                    return null;
                },
                deleteSave: () => {
                    console.warn('Using mock saveManager - delete failed');
                    return false;
                }
            };
        }
    }

    /**
     * Handles keyboard input
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyEvent(event) {
        const { key } = event;
        
        // Check if we have a handler for this key
        if (this.app.isAdmin && this.adminKeyHandlers[key]) {
            // Prevent default for admin keys
            event.preventDefault();
            event.stopPropagation();
            this.adminKeyHandlers[key]();
        } else if (this.keyHandlers[key]) {
            // For non-admin keys, only prevent default if the handler returns true
            const shouldPreventDefault = this.keyHandlers[key](event);
            if (shouldPreventDefault) {
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }
    
    /**
     * Handles Escape key press
     */
    handleEscapeKey() {
        // Check if the pause menu is currently visible
        const pauseMenu = document.getElementById('pause-menu');
        const isPauseMenuVisible = pauseMenu && !pauseMenu.classList.contains('hidden');
        
        if (this.app.isPaused) {
            if (isPauseMenuVisible) {
                // If menu is visible, hide it and resume the game
                this.hidePauseMenu();
                this.resumeSimulation();
            } else {
                // If menu is not visible, show it
                this.showPauseMenu();
            }
        } else {
            // If game is running, pause it and show the menu
            this.togglePause(true);
        }
        
        return true; // Always prevent default for Escape key
    }
    
    /**
     * Toggles temperature overlay
     */
    toggleTemperatureOverlay() {
        if (this.app.temperatureManager) {
            this.app.temperatureManager.toggleTemperatureOverlay();
        } else {
            logger.warn('Temperature manager not available');
        }
        return true;
    }
    
    /**
     * Toggles the pause state of the simulation
     * @param {boolean} showMenu - Whether to show the pause menu (default: false)
     * @returns {boolean} Always returns true to indicate the event was handled
     */
    togglePause(showMenu = false) {
        if (!this.app.isRunning) return true;
        
        // Handle pause/resume based on current state
        if (this.app.isPaused) {
            if (showMenu) {
                // Toggle menu visibility
                this.togglePauseMenu();
            } else {
                // Spacebar - resume the game
                this.resumeSimulation();
            }
        } else {
            // Pause the game and show menu if requested
            this.pauseSimulation(showMenu);
        }
        
        return true;
    }
    
    /**
     * Toggles statistics overlay
     */
    toggleStats() {
        // Implement stats toggle
        return true;
    }
    
    /**
     * Toggles debug overlay
     */
    toggleDebug() {
        if (this.debugOverlay) {
            const isVisible = this.debugOverlay.style.display !== 'none';
            this.debugOverlay.style.display = isVisible ? 'none' : 'block';
        }
        return true;
    }
    
    initialize() {
        this.initializeElements();
        this.setupButtonListeners();
        this.createDebugOverlay();
        this.createLoadingOverlay();
        logger.log('UI Manager initialized');
        
        // Initially hide the debug overlay until the game starts
        this.hideDebugOverlay();
    }
    
    /**
     * Creates the loading overlay element
     */
    createLoadingOverlay() {
        // Create loading overlay if it doesn't exist
        if (!this.loadingOverlay) {
            this.loadingOverlay = document.createElement('div');
            this.loadingOverlay.id = 'loading-overlay';
            this.loadingOverlay.style.position = 'fixed';
            this.loadingOverlay.style.top = '0';
            this.loadingOverlay.style.left = '0';
            this.loadingOverlay.style.width = '100%';
            this.loadingOverlay.style.height = '100%';
            this.loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            this.loadingOverlay.style.display = 'flex';
            this.loadingOverlay.style.flexDirection = 'column';
            this.loadingOverlay.style.justifyContent = 'center';
            this.loadingOverlay.style.alignItems = 'center';
            this.loadingOverlay.style.zIndex = '2000';
            this.loadingOverlay.style.color = '#fff';
            this.loadingOverlay.style.fontFamily = 'Arial, sans-serif';
            this.loadingOverlay.style.pointerEvents = 'none';
            
            // Add loading spinner
            const spinner = document.createElement('div');
            spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
            spinner.style.borderRadius = '50%';
            spinner.style.borderTop = '4px solid #fff';
            spinner.style.width = '40px';
            spinner.style.height = '40px';
            spinner.style.animation = 'spin 1s linear infinite';
            spinner.style.marginBottom = '20px';
            
            // Add loading text
            const text = document.createElement('div');
            text.id = 'loading-text';
            text.textContent = 'Loading...';
            text.style.marginBottom = '10px';
            text.style.fontSize = '18px';
            
            // Add progress text
            const progress = document.createElement('div');
            progress.id = 'loading-progress';
            progress.style.fontSize = '14px';
            progress.style.opacity = '0.8';
            
            // Add keyframe animation for spinner
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            
            // Append elements
            this.loadingOverlay.appendChild(style);
            this.loadingOverlay.appendChild(spinner);
            this.loadingOverlay.appendChild(text);
            this.loadingOverlay.appendChild(progress);
            
            // Initially hidden
            this.loadingOverlay.style.display = 'none';
            
            document.body.appendChild(this.loadingOverlay);
        }
    }
    
    /**
     * Shows the loading overlay
     * @param {string} [message='Loading...'] - The loading message to display
     */
    showLoading(message = 'Loading...') {
        if (!this.loadingOverlay) {
            this.createLoadingOverlay();
        }
        
        const text = this.loadingOverlay.querySelector('#loading-text');
        const progress = this.loadingOverlay.querySelector('#loading-progress');
        
        if (text) text.textContent = message;
        if (progress) progress.textContent = '';
        
        this.loadingOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * Updates the loading progress
     * @param {number} progress - The progress percentage (0-100)
     * @param {string} message - The progress message to display
     */
    updateLoading(progress, message) {
        if (!this.loadingOverlay) return;
        
        const progressElement = this.loadingOverlay.querySelector('#loading-progress');
        if (progressElement) {
            progressElement.textContent = message || `Loading... ${Math.round(progress)}%`;
        }
    }
    
    /**
     * Hides the loading overlay
     */
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Creates the debug overlay element
     */
    createDebugOverlay() {
        // Only create the debug overlay if it doesn't exist
        if (!this.debugOverlay) {
            this.debugOverlay = document.createElement('div');
            this.debugOverlay.id = 'debug-overlay';
            this.debugOverlay.style.position = 'fixed';
            this.debugOverlay.style.top = '10px';
            this.debugOverlay.style.left = '10px';
            this.debugOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            this.debugOverlay.style.color = '#fff';
            this.debugOverlay.style.padding = '8px 12px';
            this.debugOverlay.style.borderRadius = '4px';
            this.debugOverlay.style.fontFamily = 'monospace';
            this.debugOverlay.style.fontSize = '14px';
            this.debugOverlay.style.zIndex = '1000';
            this.debugOverlay.style.pointerEvents = 'none';
            this.debugOverlay.style.userSelect = 'none';
            this.debugOverlay.style.lineHeight = '1.5';
            this.debugOverlay.innerHTML = 'FPS: 0\nTime: 0.0s\nTemp: N/A';
            
            document.body.appendChild(this.debugOverlay);
        }
    }
    
    /**
     * Shows the debug overlay
     */
    showDebugOverlay() {
        if (this.debugOverlay) {
            this.debugOverlay.style.display = 'block';
        }
    }
    
    /**
     * Hides the debug overlay
     */
    hideDebugOverlay() {
        if (this.debugOverlay) {
            this.debugOverlay.style.display = 'none';
        }
    }
    
    /**
     * Updates the debug overlay with current stats
     * @param {number} time - Current timestamp
     * @param {Object} cellInfo - Information about the selected cell
     */
    updateDebugOverlay(time, cellInfo = null) {
        // Don't update if the overlay is hidden or doesn't exist
        if (!this.debugOverlay || this.debugOverlay.style.display === 'none') return;
        
        // Calculate FPS
        this.frames++;
        if (time - this.lastTime >= 1000) {
            this.fps = Math.round((this.frames * 1000) / (time - this.lastTime));
            this.frames = 0;
            this.lastTime = time;
        }
        
        // Update simulation time (in seconds with 1 decimal place)
        if (this.app && this.app.isRunning && !this.app.isPaused) {
            const delta = (time - this.lastUpdateTime) / 1000; // Convert to seconds
            this.simulationTime += delta;
        }
        this.lastUpdateTime = time;
        
        // Get temperature or show N/A if no cell is selected
        let infoText = 'No cell selected';
        if (cellInfo && cellInfo.temp !== undefined) {
            infoText = `Temp: ${cellInfo.temp.toFixed(1)}°C`;
        }
        
        // Update overlay content
        this.debugOverlay.innerHTML = `
            FPS: ${this.fps}<br>
            Time: ${this.simulationTime.toFixed(1)}s<br>
            ${infoText}
        `;
    }

    initializeElements() {
        this.elements = {
            gameContainer: document.getElementById('game-container'),
            mainMenu: document.getElementById('main-menu'),
            newGameBtn: document.getElementById('new-game-btn'),
            loadGameBtn: document.getElementById('load-game-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            pauseMenu: document.getElementById('pause-menu'),
            pauseBanner: document.getElementById('pause-banner'),
            resumeBtn: document.getElementById('resume-btn'),
            saveGameBtn: document.getElementById('save-game-btn'),
            saveQuitBtn: document.getElementById('save-quit-btn'),
            settingsMenuBtn: document.getElementById('settings-menu-btn'),
            quitToMenuBtn: document.getElementById('quit-to-menu-btn')
        };
        
        const newGameModal = document.getElementById('new-game-modal');
        this.elements.newGameModal = newGameModal;
        
        // Add other elements
        Object.assign(this.elements, {
            saveNameInput: document.getElementById('save-name'),
            closeNewGameBtn: document.getElementById('close-new-game'),
            cancelNewGameBtn: document.getElementById('cancel-new-game'),
            confirmNewGameBtn: document.getElementById('confirm-new-game')
        });
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
            confirmNewGameBtn.addEventListener('click', () => this.app.confirmNewGame());
        }
        
        // Close modal when clicking outside the content
        if (newGameModal) {
            newGameModal.addEventListener('click', (e) => {
                if (e.target === newGameModal) {
                    this.hideNewGameModal();
                }
            });
            
            // Handle keyboard events for the new game modal
            if (saveNameInput) {
                // Handle Enter key in the save name input
                saveNameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.app.confirmNewGame();
                    }
                });
                
                // Handle ESC key to close the modal
                saveNameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.hideNewGameModal();
                    }
                });
            }
        }

        // Set up button event listeners
        // Main menu buttons
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.app.startNewGame());
        }
        
        if (loadGameBtn) {
            loadGameBtn.addEventListener('click', () => this.showSaveManager());
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.app.showSettings());
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
        
        // Note: ESC key handling is now in App.handleKeyDown
    }

    // UI State Management
    showMainMenu() {
        if (this.elements.mainMenu) this.elements.mainMenu.style.display = 'flex';
        if (this.elements.pauseMenu) this.elements.pauseMenu.style.display = 'none';
    }

    hideMainMenu() {
        if (this.elements.mainMenu) this.elements.mainMenu.style.display = 'none';
    }

    showPauseMenu() {
        if (this.elements.pauseMenu) {
            this.elements.pauseMenu.classList.remove('hidden');
            this.elements.pauseMenu.style.display = 'flex';
            this.elements.pauseMenu.style.visibility = 'visible';
            this.elements.pauseMenu.style.opacity = '1';
        } else {
            console.error('Pause menu element not found in UIManager');
            console.error('Available elements in the DOM with IDs:', 
                Array.from(document.querySelectorAll('[id]')).map(el => el.id));
        }
        
        // Show pause banner
        if (this.elements.pauseBanner) {
            this.elements.pauseBanner.classList.remove('hidden');
        }
        
        // Hide the tooltip when pausing
        if (this.app && this.app.selectionManager) {
            this.app.selectionManager.hideTooltip();
        }
    }

    hidePauseMenu() {
        // Hide the pause menu
        if (this.elements.pauseMenu) {
            this.elements.pauseMenu.style.display = 'none';
            this.elements.pauseMenu.classList.add('hidden');
        }
        // Also hide the pause banner when menu is closed
        if (this.elements.pauseBanner) {
            this.elements.pauseBanner.classList.add('hidden');
        }
    }
    
    /* Shows the pause banner */
    showPauseBanner() {
        if (this.elements.pauseBanner) {
            this.elements.pauseBanner.classList.remove('hidden');
        }
    }
    
    /**
     * Hides the pause banner
     */
    hidePauseBanner() {
        if (this.elements.pauseBanner) {
            this.elements.pauseBanner.classList.add('hidden');
        }
    }

    /**
     * Shows a confirmation dialog before performing an action
     * @param {Object} save - The save object to be deleted
     * @param {Function} onConfirm - Callback function when user confirms
     */
    showConfirmationModal(save, onConfirm) {
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
            confirmationModal.onclick = null;
        };
        
        // Handle confirm button click
        confirmBtn.onclick = () => {
            if (typeof onConfirm === 'function') {
                onConfirm();
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

    showNewGameModal() {
        // Try to find the element again in case it wasn't found during initialization
        if (!this.elements.newGameModal) {
            this.elements.newGameModal = document.getElementById('new-game-modal');
        }
        
        if (this.elements.newGameModal) {
            // Remove the 'hidden' class if it exists
            this.elements.newGameModal.classList.remove('hidden');
            
            // Set initial styles for fade-in effect
            this.elements.newGameModal.style.display = 'flex';
            this.elements.newGameModal.style.visibility = 'hidden';
            this.elements.newGameModal.style.opacity = '0';
            
            // Force reflow to ensure the initial styles are applied
            void this.elements.newGameModal.offsetHeight;
            
            // Fade in the modal
            this.elements.newGameModal.style.visibility = 'visible';
            this.elements.newGameModal.style.opacity = '1';
            
            // Add keydown event listener for ESC key
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    this.hideNewGameModal();
                }
            };
            
            // Add the event listener
            document.addEventListener('keydown', handleKeyDown);
            
            // Store the handler so we can remove it later
            this.newGameModalKeyHandler = handleKeyDown;
            
            // Focus the input field with a small delay to ensure it's visible
            if (this.elements.saveNameInput) {
                // Select any existing text in the input
                this.elements.saveNameInput.select();
                // Set focus
                setTimeout(() => {
                    this.elements.saveNameInput.focus();
                }, 50);
            }
        } else {
            console.error('New game modal element not found in UIManager');
            console.error('Available elements in the DOM with IDs:', 
                Array.from(document.querySelectorAll('[id]')).map(el => el.id));
        }
    }

    hideNewGameModal() {
        if (this.elements.newGameModal) {
            this.elements.newGameModal.style.display = 'none';
            
            // Remove the ESC key event listener if it exists
            if (this.newGameModalKeyHandler) {
                document.removeEventListener('keydown', this.newGameModalKeyHandler);
                this.newGameModalKeyHandler = null;
            }
            
            // Clear the input field when hiding the modal
            if (this.elements.saveNameInput) {
                this.elements.saveNameInput.value = '';
            }
        }
    }

    getSaveName() {
        return this.elements.saveNameInput ? this.elements.saveNameInput.value.trim() : '';
    }

    // Save Manager UI Methods
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
        }, 300);
    }
    
    refreshSaveList() {
        const savesList = document.getElementById('saves-list');
        if (!savesList) {
            logger.error('Saves list element not found');
            return;
        }
        
        // Clear existing list
        savesList.innerHTML = '';
        
        try {
            // Get all saves from save manager
            const saves = this.saveManager.getSaves();
            
            if (!saves || !Array.isArray(saves)) {
                throw new Error('Invalid saves data received');
            }
            
            if (saves.length === 0) {
                const noSaves = document.createElement('div');
                noSaves.className = 'no-saves';
                noSaves.textContent = 'No saved games found';
                savesList.appendChild(noSaves);
                return;
            }
            
            // Add each save to the list
            saves.forEach(save => {
                try {
                    const saveItem = document.createElement('div');
                    saveItem.className = 'save-item';
                    saveItem.dataset.saveId = save.id;
                    
                    // Format the date
                    const saveDate = new Date(save.timestamp);
                    const formattedDate = saveDate.toLocaleString();
                    
                    saveItem.innerHTML = `
                        <div class="save-info">
                            <div class="save-name">${save.name || 'Unnamed Save'}</div>
                            <div class="save-meta">
                                <span class="save-date">${formattedDate}</span>
                                <span class="save-turn">Turn: ${save.metadata?.turnCount || 0}</span>
                                <span class="save-creatures">Creatures: ${save.metadata?.creatureCount || 0}</span>
                            </div>
                        </div>
                        <div class="save-actions">
                            <button class="btn btn-load">Load</button>
                            <button class="btn btn-delete">Delete</button>
                        </div>
                    `;

                    // Add click handler to load the game
                    const loadBtn = saveItem.querySelector('.btn-load');
                    if (loadBtn) {
                        loadBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.loadGame(save.id);
                        });
                    }
                    
                    // Add click handler to delete the save
                    const deleteBtn = saveItem.querySelector('.btn-delete');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.showConfirmationModal(save, () => {
                                if (this.saveManager) {
                                    this.saveManager.deleteSave(save.id);
                                    this.refreshSaveList();
                                } else {
                                    console.error('Save manager not available');
                                }
                            });
                        });
                    }
                    
                    savesList.appendChild(saveItem);
                } catch (error) {
                    console.error('Error creating save item:', error);
                }
            });
        } catch (error) {
            console.error('Error loading saves:', error);
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.textContent = 'Error loading saved games';
            savesList.appendChild(errorMsg);
        }
    }
    
    // Notification System
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
    
    // Pause Menu Functions
    onResumeClick() {
        this.resumeSimulation();
    }
    
    /**
     * Toggles the pause menu visibility
     */
    togglePauseMenu() {
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu && !pauseMenu.classList.contains('hidden')) {
            this.hidePauseMenu();
        } else {
            this.showPauseMenu();
        }
    }
    
    /**
     * Pauses the simulation
     * @param {boolean} showMenu - Whether to show the pause menu
     */
    pauseSimulation(showMenu = false) {
        if (!this.app.isRunning) return;
        
        // Pause the simulation
        if (window.Module) {
            if (typeof window.Module._emscripten_pause_main_loop === 'function') {
                window.Module._emscripten_pause_main_loop();
            } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
                window.Module.asm._emscripten_pause_main_loop();
            }
        }
        
        // Update app state
        this.app.isPaused = true;
        
        // Hide any visible tooltips
        if (this.app.selectionManager) {
            this.app.selectionManager.hideTooltip();
        }
        
        // Show UI elements
        this.showPauseBanner();
        if (showMenu) {
            this.showPauseMenu();
        }
        
        logger.log('Simulation paused' + (showMenu ? ' (with menu)' : ''));
    }
    
    /**
     * Resumes the simulation
     */
    resumeSimulation() {
        if (!this.app.isPaused) return;
        
        // Resume the simulation
        if (window.Module) {
            if (typeof window.Module._emscripten_resume_main_loop === 'function') {
                window.Module._emscripten_resume_main_loop();
            } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
                window.Module.asm._emscripten_resume_main_loop();
            }
        }
        
        // Update app state
        this.app.isPaused = false;
        
        // Hide UI elements
        this.hidePauseMenu();
        this.hidePauseBanner();
        
        // Force update the hovered cell and tooltip
        if (this.app.selectionManager) {
            this.app.selectionManager.forceUpdateHoveredCell();
        }
        
        logger.log('Simulation resumed');
    }
    
    /**
     * Handles the Save Game button click from the pause menu
     * @returns {Promise<Object|null>} The saved game data or null if save failed
     */
    async onSaveGameClick() {
        logger.log('Save Game clicked');
        
        try {
            this.showLoading('Saving game...');
            
            if (!this.app.gameState) {
                throw new Error('No game state to save');
            }
            
            // If we have an existing save, use its ID to overwrite
            let saveId = null;
            if (this.app.gameState.saveId) {
                saveId = this.app.gameState.saveId;
                logger.log(`Updating existing save with ID: ${saveId}`);
            }
            
            // Save the game with the current game state
            const savedGame = await this.app.saveManager.saveGame(
                this.app.gameState,
                this.app.gameState.saveName || 'My Game',
                saveId
            );
            
            if (savedGame) {
                // Update the game state with the save ID if this is a new save
                if (!this.app.gameState.saveId && savedGame.id) {
                    this.app.gameState.saveId = savedGame.id;
                }
                
                this.showNotification('Game saved successfully!');
                logger.log('Game saved successfully:', savedGame);
                return savedGame;
            } else {
                throw new Error('Failed to save game');
            }
        } catch (error) {
            logger.error('Error saving game:', error);
            this.showNotification('Failed to save game. Please try again.');
            throw error;
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Handles the Save & Quit button click from the pause menu
     * Saves the current game and returns to the main menu
     */
    async onSaveAndQuitClick() {
        logger.log('Save & Quit clicked');
        
        try {
            // First save the game
            const savedGame = await this.onSaveGameClick();
            
            if (savedGame) {
                // Only quit if save was successful, and prevent reset since we just saved
                await this.onQuitToMenuClick(true);
            } else {
                throw new Error('Failed to save game');
            }
        } catch (error) {
            logger.error('Error during save & quit:', error);
            this.showNotification('Failed to save game. Your progress may not be saved.');
            throw error;
        }
    }
    
    /**
     * Handles the Quit to Menu button click from the pause menu
     * @param {boolean} [preventReset=false] - If true, skips resetting the simulation
     * @returns {Promise<boolean>} True if the operation was successful
     */
    async onQuitToMenuClick(preventReset = false) {
        logger.log('Quitting to main menu...', { preventReset });
        
        try {
            // Only reset if not prevented
            if (!preventReset && this.app.resetSimulation) {
                await this.app.resetSimulation();
            }
            
            // Update game state
            if (this.app) {
                this.app.isRunning = false;
                this.app.isPaused = false;
            }
            
            // Update UI
            this.hidePauseBanner();
            this.hidePauseMenu();
            this.hideDebugOverlay();
            this.showMainMenu();
            
            // Hide the game container if it exists
            if (this.elements.gameContainer) {
                this.elements.gameContainer.classList.add('hidden');
            }
            
            // Clean up tooltip and mouse events
            if (this.app.selectionManager) {
                // Hide the tooltip immediately
                this.app.selectionManager.hideTooltip();
                
                // Clear any pending tooltip updates
                if (this.app.selectionManager.tooltipTimeout) {
                    clearTimeout(this.app.selectionManager.tooltipTimeout);
                }
                
                // Reset hover state to prevent tooltip from reappearing
                this.app.selectionManager.hoveredCell = null;
                this.app.selectionManager.lastHoveredCell = null;
            }
            
            logger.log('Successfully returned to main menu');
            return true;
        } catch (error) {
            logger.error('Error during quit to menu:', error);
            this.showNotification('Error returning to main menu');
            throw error;
        }
    }
    
    // Game State UI Functions
    // Moved to above onSaveAndQuitClick
}
