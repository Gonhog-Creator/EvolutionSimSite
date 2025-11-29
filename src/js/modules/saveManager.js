import { logger } from './logger.js';

/**
 * SaveManager handles all save/load operations for the game
 */
class SaveManager {
    constructor() {
        this.STORAGE_KEY = 'evolution_sim_saves';
        this.saves = this._loadSaves();
    }

    /**
     * Loads all saves from local storage
     * @private
     */
    _loadSaves() {
        try {
            const savesJson = localStorage.getItem(this.STORAGE_KEY);
            if (!savesJson) return [];
            
            const saves = JSON.parse(savesJson);
            // Ensure all saves have required fields
            return saves.map(save => ({
                id: save.id || this._generateId(),
                name: save.name || 'Unnamed Save',
                timestamp: save.timestamp || Date.now(),
                gameState: save.gameState || {},
                metadata: {
                    turnCount: save.metadata?.turnCount || 0,
                    creatureCount: save.metadata?.creatureCount || 0,
                    createdAt: save.metadata?.createdAt || Date.now(),
                    lastPlayed: save.metadata?.lastPlayed || Date.now(),
                    ...save.metadata
                },
                version: save.version || '1.0.0'
            }));
        } catch (error) {
            logger.error('Error loading saves:', error);
            return [];
        }
    }

    /**
     * Saves all game states to local storage
     * @private
     */
    _saveSaves() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.saves));
            return true;
        } catch (error) {
            logger.error('Error saving game:', error);
            return false;
        }
    }

    /**
     * Generates a unique ID for a new save
     * @private
     */
    _generateId() {
        return 'save_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Gets all saved games
     * @returns {Array} Array of saved games
     */
    getSaves() {
        return [...this.saves].sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Gets a specific save by ID
     * @param {string} id - The save ID
     * @returns {Object|null} The save object or null if not found
     */
    getSave(id) {
        return this.saves.find(save => save.id === id) || null;
    }

    /**
     * Creates a new save
     * @param {Object} gameState - The game state to save
     * @param {string} name - The name of the save
     * @returns {Object} The created save object
     */
    createSave(gameState, name = 'New Save') {
        const save = {
            id: this._generateId(),
            name: name.trim() || 'Unnamed Save',
            timestamp: Date.now(),
            gameState: { ...gameState },
            metadata: {
                turnCount: gameState.turnCount || 0,
                creatureCount: gameState.creatures?.length || 0,
                createdAt: Date.now(),
                lastPlayed: Date.now()
            },
            version: '1.0.0'
        };

        this.saves.push(save);
        this._saveSaves();
        return save;
    }

    /**
     * Updates an existing save
     * @param {string} id - The save ID to update
     * @param {Object} updates - The updates to apply
     * @returns {Object|null} The updated save or null if not found
     */
    updateSave(id, updates) {
        const saveIndex = this.saves.findIndex(save => save.id === id);
        if (saveIndex === -1) return null;

        const updatedSave = {
            ...this.saves[saveIndex],
            ...updates,
            timestamp: Date.now(),
            metadata: {
                ...this.saves[saveIndex].metadata,
                ...(updates.metadata || {}),
                lastPlayed: Date.now()
            }
        };

        this.saves[saveIndex] = updatedSave;
        this._saveSaves();
        return updatedSave;
    }

    /**
     * Deletes a save
     * @param {string} id - The save ID to delete
     * @returns {boolean} True if deleted, false if not found
     */
    deleteSave(id) {
        const initialLength = this.saves.length;
        this.saves = this.saves.filter(save => save.id !== id);
        
        if (this.saves.length < initialLength) {
            this._saveSaves();
            return true;
        }
        return false;
    }

    /**
     * Saves the current game state
     * @param {Object} gameState - The current game state
     * @param {string} [name] - Optional save name (for new saves)
     * @param {string} [saveId] - Optional save ID (for updates)
     * @returns {Object} The saved game state
     */
    saveGame(gameState, name, saveId = null) {
        if (saveId) {
            // Update existing save
            return this.updateSave(saveId, {
                gameState,
                metadata: {
                    turnCount: gameState.turnCount || 0,
                    creatureCount: gameState.creatures?.length || 0
                }
            });
        } else {
            // Create new save
            return this.createSave(gameState, name);
        }
    }

    /**
     * Loads a saved game state
     * @param {string} id - The save ID to load
     * @returns {Object|null} The loaded game state or null if not found
     */
    loadGame(id) {
        const save = this.getSave(id);
        if (!save) return null;

        // Update last played timestamp
        this.updateSave(id, { 
            metadata: { lastPlayed: Date.now() } 
        });

        return save.gameState;
    }

    /**
     * Exports all saves as a JSON string
     * @returns {string} JSON string of all saves
     */
    exportSaves() {
        return JSON.stringify(this.saves, null, 2);
    }

    /**
     * Imports saves from a JSON string
     * @param {string} jsonString - JSON string of saves to import
     * @param {boolean} merge - Whether to merge with existing saves
     * @returns {boolean} True if import was successful
     */
    importSaves(jsonString, merge = true) {
        try {
            const importedSaves = JSON.parse(jsonString);
            
            if (!Array.isArray(importedSaves)) {
                throw new Error('Invalid save data format');
            }

            if (merge) {
                // Create a map of existing saves by ID
                const existingSaves = new Map(this.saves.map(save => [save.id, save]));
                
                // Merge with existing saves, preferring imported ones
                importedSaves.forEach(save => {
                    existingSaves.set(save.id, {
                        ...(existingSaves.get(save.id) || {}),
                        ...save,
                        // Always use the imported timestamp to maintain save order
                        timestamp: save.timestamp || Date.now()
                    });
                });
                
                this.saves = Array.from(existingSaves.values());
            } else {
                this.saves = importedSaves;
            }

            this._saveSaves();
            return true;
        } catch (error) {
            logger.error('Error importing saves:', error);
            return false;
        }
    }
}

// Export a singleton instance
export const saveManager = new SaveManager();
