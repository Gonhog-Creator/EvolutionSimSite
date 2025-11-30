import { logger } from './logger.js';

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

    initialize() {
        this.initializeElements();
        this.setupButtonListeners();
        this.createDebugOverlay();
        logger.log('UI Manager initialized');
    }
    
    /**
     * Creates the debug overlay element
     */
    createDebugOverlay() {
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
    
    /**
     * Updates the debug overlay with current stats
     * @param {number} time - Current timestamp
     * @param {Object} cellInfo - Information about the selected cell
     */
    updateDebugOverlay(time, cellInfo = null) {
        if (!this.debugOverlay) return;
        
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
            loadGameBtn.addEventListener('click', () => this.app.showSaveManager());
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.app.showSettings());
        }
        
        // Pause menu buttons
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.app.onResumeClick());
        }
        
        if (saveGameBtn) {
            saveGameBtn.addEventListener('click', () => this.app.onSaveGameClick());
        }
        
        if (saveQuitBtn) {
            saveQuitBtn.addEventListener('click', () => this.app.onSaveAndQuitClick());
        }
        
        if (settingsMenuBtn) {
            settingsMenuBtn.addEventListener('click', () => this.app.showSettings());
        }
        
        if (quitToMenuBtn) {
            quitToMenuBtn.addEventListener('click', () => this.app.onQuitToMenuClick());
        }
        
        // Add keyboard event listener for ESC key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.app.isRunning) {
                this.app.togglePause();
                event.preventDefault(); // Prevent default ESC behavior
            }
        });
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
    }

    hidePauseMenu() {
        if (this.elements.pauseMenu) {
            this.elements.pauseMenu.style.display = 'none';
            this.elements.pauseMenu.classList.add('hidden');
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
        this.app.resumeSimulation();
    }
    
    async onSaveAndQuitClick() {
        logger.log('Save & Quit clicked');
        
        try {
            // First save the game
            await this.app.onSaveGameClick();
            
            // Small delay to show the save notification
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then quit to menu
            this.onQuitToMenuClick();
        } catch (error) {
            logger.error('Error during save & quit:', error);
            this.showNotification('Error saving game. Changes may not be saved.');
        }
    }
    
    async onQuitToMenuClick() {
        try {
            logger.log('Quitting to main menu...');
            
            // Reset the simulation
            await this.app.resetSimulation();
            
            // Show main menu and hide game container
            this.showMainMenu();
            
            // Hide the game container
            if (this.elements.gameContainer) {
                this.elements.gameContainer.classList.add('hidden');
            }
            
            // Reset states
            this.app.isRunning = false;
            this.app.isPaused = false;
            
            logger.log('Successfully returned to main menu');
        } catch (error) {
            logger.error('Error during quit to menu:', error);
            throw error;
        }
    }
    
    // Game State UI Functions
    togglePause() {
        if (!this.app.isRunning) return;
        
        this.app.isPaused = !this.app.isPaused;
        
        if (this.app.isPaused) {
            // Pause the simulation
            if (window.Module) {
                if (typeof window.Module._emscripten_pause_main_loop === 'function') {
                    window.Module._emscripten_pause_main_loop();
                } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
                    window.Module.asm._emscripten_pause_main_loop();
                }
            }
            
            // Show pause menu
            this.showPauseMenu();
            
            logger.log('Simulation paused');
        } else {
            this.resumeSimulation();
        }
    }
    
    resumeSimulation() {
        if (window.Module) {
            if (typeof window.Module._emscripten_resume_main_loop === 'function') {
                window.Module._emscripten_resume_main_loop();
            } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
                window.Module.asm._emscripten_resume_main_loop();
            }
        }
        
        // Hide pause menu
        this.hidePauseMenu();
        
        this.app.isPaused = false;
        logger.log('Simulation resumed');
    }
}
