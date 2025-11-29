import { saveManager } from '../modules/saveManager.js';
import { logger } from '../modules/logger.js';

export class SaveManagerModal {
    constructor() {
        this.modal = null;
        this.savesList = null;
        this.importFileInput = null;
        this.init();
    }

    async init() {
        try {
            // Create and append modal HTML
            await this.createModal();
            
            // Get references to elements
            this.modal = document.getElementById('save-manager-modal');
            this.savesList = document.getElementById('saves-list');
            this.importFileInput = document.getElementById('import-file-input');
            
            if (!this.modal || !this.savesList || !this.importFileInput) {
                throw new Error('Failed to initialize save manager modal elements');
            }
            
            // Add event listeners
            this.setupEventListeners();
            
            // Initial render
            this.renderSavesList();
        } catch (error) {
            logger.error('Error initializing save manager modal:', error);
            throw error;
        }
    }

    async createModal() {
        // Always use the fallback method for now
        this.createModalFallback();
    }
    
    createModalFallback() {
        const modalContainer = document.getElementById('modals-container') || document.body;
        
        const modalHTML = `
            <div id="save-manager-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Saved Games</h2>
                        <button class="close-btn" id="close-save-manager">&times;</button>
                    </div>
                    <div class="saves-list" id="saves-list">
                        <div class="no-saves">No saved games found</div>
                    </div>
                    <div class="modal-actions">
                        <button id="import-save-btn" class="btn">Import Save</button>
                        <input type="file" id="import-file-input" accept=".json" style="display: none;">
                    </div>
                </div>
            </div>
        `;
        
        modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    }

    setupEventListeners() {
        // Close button
        const closeBtn = document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // New save button - only add if the element exists
        const newSaveBtn = document.getElementById('new-save-btn');
        if (newSaveBtn) {
            newSaveBtn.addEventListener('click', () => this.createNewSave());
        }
        
        // Import save button
        const importSaveBtn = document.getElementById('import-save-btn');
        if (importSaveBtn) {
            importSaveBtn.addEventListener('click', () => {
                this.importFileInput?.click();
            });
        }
        
        // File input change
        if (this.importFileInput) {
            this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }
        
        // Close when clicking outside the modal
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
    }

    show() {
        try {
            if (!this.modal) {
                throw new Error('Modal element not found');
            }
            
            // Ensure the modal is visible
            this.modal.style.display = 'flex';
            this.modal.classList.remove('hidden');
            
            // Update the saves list
            this.renderSavesList();
            
            // Focus the close button for better accessibility
            const closeBtn = this.modal.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.focus();
            }
            
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
            
            logger.log('Save manager modal shown');
        } catch (error) {
            logger.error('Error showing save manager modal:', error);
            throw error;
        }
    }

    hide() {
        try {
            if (!this.modal) {
                return;
            }
            
            // Hide the modal
            this.modal.style.display = 'none';
            this.modal.classList.add('hidden');
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            logger.log('Save manager modal hidden');
        } catch (error) {
            logger.error('Error hiding save manager modal:', error);
        }
    }

    renderSavesList() {
        if (!this.savesList) {
            logger.error('Saves list element not found');
            return;
        }
        
        try {
            const saves = saveManager.saves || [];
            this.savesList.innerHTML = '';
            
            if (saves.length === 0) {
                const noSaves = document.createElement('div');
                noSaves.className = 'no-saves';
                noSaves.textContent = 'No saved games found';
                this.savesList.appendChild(noSaves);
                return;
            }
            
            // Sort saves by timestamp (newest first)
            const sortedSaves = [...saves].sort((a, b) => {
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
            
            sortedSaves.forEach((save, index) => {
                const saveItem = document.createElement('div');
                saveItem.className = 'save-item';
                
                const saveInfo = document.createElement('div');
                saveInfo.className = 'save-info';
                
                // Save name
                const saveName = document.createElement('div');
                saveName.className = 'save-name';
                saveName.textContent = save.name || `Save ${index + 1}`;
                
                // Save metadata
                const saveMeta = document.createElement('div');
                saveMeta.className = 'save-meta';
                
                // Format date
                const saveDate = new Date(save.timestamp);
                const formattedDate = saveDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const saveDateEl = document.createElement('div');
                saveDateEl.className = 'save-date';
                saveDateEl.textContent = formattedDate;
                
                // Add any additional metadata from the save
                if (save.creatures) {
                    const creaturesCount = document.createElement('div');
                    creaturesCount.className = 'save-creatures';
                    creaturesCount.textContent = `${save.creatures.length} creatures`;
                    saveMeta.appendChild(creaturesCount);
                }
                
                saveMeta.appendChild(saveDateEl);
                saveInfo.appendChild(saveName);
                saveInfo.appendChild(saveMeta);
                
                // Save actions
                const saveActions = document.createElement('div');
                saveActions.className = 'save-actions';
                
                // Load button
                const loadButton = document.createElement('button');
                loadButton.className = 'btn btn-load';
                loadButton.innerHTML = '<i class="fas fa-play"></i> Load';
                loadButton.title = 'Load this save';
                loadButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadGame(save.id || index);
                });
                
                // Delete button
                const deleteButton = document.createElement('button');
                deleteButton.className = 'btn btn-delete';
                deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                deleteButton.title = 'Delete this save';
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.confirmDeleteSave(save.id || index, save.name || `Save ${index + 1}`);
                });
                
                saveActions.appendChild(loadButton);
                saveActions.appendChild(deleteButton);
                
                saveItem.appendChild(saveInfo);
                saveItem.appendChild(saveActions);
                
                // Add click handler to the whole item
                saveItem.addEventListener('click', (e) => {
                    if (e.target !== loadButton && e.target !== deleteButton) {
                        this.loadGame(save.id || index);
                    }
                });
                
                this.savesList.appendChild(saveItem);
            });
            
            logger.log(`Rendered ${saves.length} saved games`);
            
        } catch (error) {
            logger.error('Error rendering saves list:', error);
            
            // Show error message to user
            this.savesList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load saved games. Please try again.</p>
                </div>
            `;
        }
    }

    showRenameInput(saveItem, nameElement, index) {
        const currentName = nameElement.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                saveRename();
            } else if (e.key === 'Escape') {
                nameElement.textContent = currentName;
            }
        });
        
        nameElement.textContent = '';
        nameElement.appendChild(input);
        input.focus();
    }

    async createNewSave() {
        const saveName = prompt('Enter a name for your save:');
        if (!saveName) return;
        
        // Get the current game state from your game instance
        // Replace this with your actual game state saving logic
        const gameState = {
            // Example game state
            timestamp: Date.now(),
            // Add your game state properties here
        };
        
        saveManager.saveGame(saveName, gameState);
        this.renderSavesList();
    }

    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            await saveManager.importSave(file);
            this.renderSavesList();
            alert('Save imported successfully!');
        } catch (error) {
            logger.error('Error importing save:', error);
            alert('Failed to import save. Please check the console for details.');
        }
        
        // Reset the file input
        event.target.value = '';
    }

    loadSave(index) {
        const saveData = saveManager.loadGame(index);
        if (saveData) {
            // Close the modal
            this.hide();
            
            // Load the save in your game
            // Replace this with your actual game loading logic
            console.log('Loading save:', saveData);
            
            // Example: if you have a game instance
            // if (window.gameInstance) {
            //     window.gameInstance.loadGameState(saveData);
            // }
            
            return true;
        }
        return false;
    }
}

// Create and export a singleton instance
export const saveManagerModal = new SaveManagerModal();
