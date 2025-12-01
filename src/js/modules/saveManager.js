import { logger } from './logger.js';

// Constants
const SAVE_VERSION = 1;
const SAVE_PREFIX = 'evosim_save_';

/**
 * SaveManager handles all save/load operations for the game
 */
class SaveManager {
    constructor(options = {}) {
        this._wasmModule = null;
        this._saveSystem = null;
        this._useFallback = false;
        this.STORAGE_KEY = 'evolution_sim_saves';
        
        // Initialize save directory
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        }
        
        this.saves = this._loadSaves();
        
        // Initialize with WebAssembly module if provided
        if (options && options.wasmModule) {
            this.setWasmModule(options.wasmModule);
        } else if (options && options.useFallback) {
            // Use fallback if explicitly requested
            this._useFallback = true;
            logger.warn('Using JavaScript fallback save system');
        } else {
            // Default to trying WebAssembly if available
            this._useFallback = false;
        }
    }
    
    /**
     * Sets the WebAssembly module for save operations
     * @param {Object} wasmModule - The WebAssembly module with SaveSystem
     */
    setWasmModule(wasmModule) {
        if (!wasmModule) {
            console.warn('No WebAssembly module provided, using fallback save system');
            this._useFallback = true;
            return;
        }
        
        // Check if the module is a promise (common with dynamic imports)
        if (wasmModule && typeof wasmModule.then === 'function') {
            return wasmModule.then(module => this.setWasmModule(module));
        }
        
        try {
            // Try to get the exports from various common locations
            const getExports = (module) => {
                // Check direct properties
                if (module.TemperatureSystem && module.SaveSystem) {
                    return {
                        TemperatureSystem: module.TemperatureSystem,
                        SaveSystem: module.SaveSystem
                    };
                }
                
                // Check exports object
                if (module.exports) {
                    if (module.exports.TemperatureSystem && module.exports.SaveSystem) {
                        return {
                            TemperatureSystem: module.exports.TemperatureSystem,
                            SaveSystem: module.exports.SaveSystem
                        };
                    }
                }
                
                // Check instance exports
                if (module.instance && module.instance.exports) {
                    if (module.instance.exports.TemperatureSystem && module.instance.exports.SaveSystem) {
                        return {
                            TemperatureSystem: module.instance.exports.TemperatureSystem,
                            SaveSystem: module.instance.exports.SaveSystem
                        };
                    }
                }
                
                // Check for Module object with asm.js exports
                if (module.asm && module.asm.TemperatureSystem && module.asm.SaveSystem) {
                    return {
                        TemperatureSystem: module.asm.TemperatureSystem,
                        SaveSystem: module.asm.SaveSystem
                    };
                }
                
                return null;
            };
            
            // Try to get exports from the module
            const exports = getExports(wasmModule);
            
            if (exports) {
                this._wasmModule = wasmModule;
                this._saveSystem = new exports.SaveSystem();
                this._TemperatureSystem = exports.TemperatureSystem;
                console.log('Successfully initialized WebAssembly save system');
                return;
            }
            
            // If we get here, we couldn't find the exports
            console.warn('Could not find required WebAssembly exports. Available exports:', 
                Object.keys(wasmModule).filter(k => typeof wasmModule[k] === 'function'));
                
            // As a last resort, check the window object
            if (window.TemperatureSystem && window.SaveSystem) {
                console.log('Using WebAssembly classes from window object');
                this._wasmModule = wasmModule;
                this._saveSystem = new window.SaveSystem();
                this._TemperatureSystem = window.TemperatureSystem;
                return;
            }
            
            // If we still don't have what we need, use the fallback
            console.warn('Falling back to JavaScript save system');
            this._useFallback = true;
            
        } catch (error) {
            console.error('Error initializing WebAssembly module:', error);
            this._useFallback = true;
        }
    }
    
    /**
     * Gets the save system instance
     * @throws {Error} If WebAssembly module is not loaded
     */
    get saveSystem() {
        if (!this._saveSystem) {
            throw new Error('WebAssembly module not loaded. Call setWasmModule() first.');
        }
        return this._saveSystem;
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
                binaryData: save.binaryData || [],
                metadata: {
                    width: save.metadata?.width || 0,
                    height: save.metadata?.height || 0,
                    creatureCount: save.metadata?.creatureCount || 0,
                    simulationTime: save.metadata?.simulationTime || 0,
                    createdAt: save.metadata?.createdAt || Date.now(),
                    lastPlayed: save.metadata?.lastPlayed || Date.now(),
                    ...save.metadata
                },
                version: save.version || SAVE_VERSION,
                gameState: {
                    grid: {
                        width: save.metadata?.width || 0,
                        height: save.metadata?.height || 0
                    },
                    creatures: save.gameState?.creatures || [],
                    simulationTime: save.metadata?.simulationTime || 0,
                    // Include temperature data if it exists in the save
                    ...(save.gameState?.temperatureData && { 
                        temperatureData: save.gameState.temperatureData 
                    }),
                    // Spread the rest of the save data
                    ...save.gameState
                }
            }));
            
            // Log the loaded temperature data for debugging
            saves.forEach(save => {
                if (save.gameState?.temperatureData) {
                    const tempData = save.gameState.temperatureData;
                    logger.log('Loaded temperature data from save:', {
                        width: tempData.width,
                        height: tempData.height,
                        hasCells: !!tempData.cells && tempData.cells.length > 0 && tempData.cells[0].length > 0
                    });
                }
            });
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
     * Gets all saved games with metadata
     * @returns {Array} Array of saved game metadata
     */
    getSaves() {
        return this._loadSaves().map(save => ({
            id: save.id,
            name: save.name,
            timestamp: save.timestamp,
            version: save.version,
            metadata: {
                ...save.metadata,
                playTime: Math.floor(((save.metadata.lastPlayed || 0) - (save.metadata.createdAt || 0)) / 60000)
            }
        })).sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Deletes a saved game
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
            binaryData: [],
            metadata: {
                width: gameState.grid?.width || 0,
                height: gameState.grid?.height || 0,
                creatureCount: gameState.creatures?.length || 0,
                simulationTime: gameState.simulationTime || 0,
                createdAt: Date.now(),
                lastPlayed: Date.now()
            },
            version: SAVE_VERSION
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
     * Saves the current game state using either the WebAssembly or JavaScript save system
     * @param {Object} gameState - The current game state
     * @param {string} name - Save name
     * @param {string} [saveId] - Optional save ID for updates
     * @param {Function} [onProgress] - Progress callback (progress, message)
     * @returns {Promise<Object>} The saved game data
     */
    async saveGame(gameState, name, saveId = null, onProgress) {
        try {
            onProgress?.(0, 'Preparing to save...');
            
            // Convert save name to a valid filename
            const saveName = name || `Save_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            
            let saveData;
            
            if (this._useFallback) {
                // Use JavaScript fallback save system
                onProgress?.(50, 'Saving game (JavaScript fallback)...');
                
                // Create a deep clone of the game state
                const gameStateClone = JSON.parse(JSON.stringify(gameState));
                
                // Get the app instance from window if not available
                const app = this.app || window.app;
                
                // Add temperature data to the game state
                if (app?.temperatureManager) {
                    try {
                        const tempData = app.temperatureManager.getTemperatureData();
                        if (tempData) {
                            // Ensure we have the latest temperature data
                            gameStateClone.temperatureData = tempData;
                            logger.log('Saving temperature data:', {
                                width: tempData.width,
                                height: tempData.height,
                                hasCells: !!tempData.cells && tempData.cells.length > 0 && tempData.cells[0].length > 0
                            });
                        } else {
                            logger.warn('No temperature data available to save');
                        }
                    } catch (error) {
                        logger.error('Error getting temperature data:', error);
                    }
                } else {
                    logger.warn('Temperature manager not available when saving');
                }
                
                saveData = {
                    id: saveId || `save_${Date.now()}`,
                    name: saveName,
                    timestamp: Date.now(),
                    version: SAVE_VERSION,
                    gameState: gameStateClone,
                    metadata: {
                        width: gameState.grid?.width || 0,
                        height: gameState.grid?.height || 0,
                        creatureCount: gameState.creatures?.length || 0,
                        simulationTime: gameState.simulationTime || 0,
                        createdAt: saveId ? (this.getSave(saveId)?.metadata?.createdAt || Date.now()) : Date.now(),
                        lastPlayed: Date.now()
                    }
                };
            } else {
                // Try to use WebAssembly save system
                try {
                    onProgress?.(10, 'Saving world state (WebAssembly)...');
                    
                    // Create a temperature system instance
                    let tempSystem = null;
                    if (this._TemperatureSystem) {
                        try {
                            tempSystem = new this._TemperatureSystem(
                                gameState.grid?.width || 100,
                                gameState.grid?.height || 100
                            );
                        } catch (error) {
                            logger.warn('Failed to create temperature system, continuing without it:', error);
                        }
                    }
                    
                    // Save using C++ system
                    const binaryData = this.saveSystem.saveGame(
                        saveName,
                        tempSystem,
                        gameState.simulationTime || 0
                    );
                    
                    saveData = {
                        id: saveId || `save_${Date.now()}`,
                        name: saveName,
                        timestamp: Date.now(),
                        version: SAVE_VERSION,
                        binaryData: binaryData ? Array.from(new Uint8Array(binaryData)) : null,
                        metadata: {
                            width: gameState.grid?.width || 0,
                            height: gameState.grid?.height || 0,
                            creatureCount: gameState.creatures?.length || 0,
                            simulationTime: gameState.simulationTime || 0,
                            createdAt: saveId ? (this.getSave(saveId)?.metadata?.createdAt || Date.now()) : Date.now(),
                            lastPlayed: Date.now()
                        }
                    };
                } catch (error) {
                    logger.warn('Error using WebAssembly save system, falling back to JavaScript:', error);
                    this._useFallback = true;
                    return this.saveGame(gameState, name, saveId, onProgress);
                }
            }
            
            // Update saves list
            onProgress?.(90, 'Updating save index...');
            const existingIndex = this.saves.findIndex(s => s.id === (saveId || saveData.id));
            
            if (existingIndex >= 0) {
                this.saves[existingIndex] = saveData;
            } else {
                this.saves.push(saveData);
            }
            
            this._saveSaves();
            onProgress?.(100, 'Game saved successfully!');
            
            return saveData;
            
        } catch (error) {
            logger.error('Error saving game:', error);
            throw error;
        }
    }

    /**
     * Loads a saved game state
     * @param {string} id - The save ID to load
     * @param {Function} [onProgress] - Progress callback (progress, message)
     * @returns {Promise<Object>} The loaded game state
     */
    async loadGame(id, onProgress) {
        try {
            onProgress?.(0, 'Loading save data...');
            
            // Get all saves from storage
            const allSaves = this._loadSaves();
            logger.log('All saves in storage:', allSaves);
            
            // Find the requested save
            const save = allSaves.find(s => s.id === id);
            if (!save) {
                logger.error(`Save with ID ${id} not found in saves:`, allSaves.map(s => s.id));
                throw new Error(`Save with ID ${id} not found`);
            }
            
            // Log the save data for debugging
            logger.log('Loading save data:', save);
            
            // Update last played timestamp
            this.updateSave(id, { 
                metadata: { lastPlayed: Date.now() } 
            });
            
            if (this._useFallback) {
                // Load using JavaScript fallback
                onProgress?.(50, 'Loading game (JavaScript fallback)...');
                
                // The game state is stored directly in the save object for the current format
                // We need to reconstruct it from the save data
                const gameState = {
                    grid: {
                        width: save.metadata?.width || 0,
                        height: save.metadata?.height || 0,
                        // Add other grid properties as needed
                    },
                    creatures: save.gameState?.creatures || [],
                    simulationTime: save.metadata?.simulationTime || 0,
                    // Spread the rest of the game state first
                    ...(save.gameState || {})
                };
                
                // Add temperature data if it exists in the save
                if (save.gameState?.temperatureData) {
                    const tempData = save.gameState.temperatureData;
                    gameState.temperatureData = tempData;
                    
                    // Log the temperature data for debugging
                    logger.log('Loaded temperature data from save:', {
                        width: tempData.width,
                        height: tempData.height,
                        hasCells: !!tempData.cells && tempData.cells.length > 0 && tempData.cells[0].length > 0,
                        cellsDimensions: tempData.cells ? 
                            `${tempData.cells.length}x${tempData.cells[0]?.length || 0}` : 'No cells'
                    });
                } else {
                    logger.warn('No temperature data found in save');
                }
                
                // Log the temperature data for debugging
                if (save.gameState?.temperatureData) {
                    logger.log('Found temperature data in save:', {
                        width: save.gameState.temperatureData.width,
                        height: save.gameState.temperatureData.height,
                        hasCells: !!save.gameState.temperatureData.cells
                    });
                }
                
                logger.log('Reconstructed game state:', gameState);
                
                onProgress?.(100, 'Game loaded successfully!');
                
                // Return the reconstructed game state with metadata
                return {
                    ...gameState,
                    saveId: save.id,
                    saveName: save.name || `Save ${new Date(save.timestamp).toLocaleString()}`,
                    ...(save.metadata || {})
                };
            } else {
                // Try to use WebAssembly load system
                try {
                    onProgress?.(10, 'Preparing data (WebAssembly)...');
                    
                    if (!save.binaryData) {
                        throw new Error('Invalid save format: missing binary data');
                    }
                    
                    const binaryData = new Uint8Array(save.binaryData);
                    
                    // Load using C++ system
                    onProgress?.(20, 'Loading world state (WebAssembly)...');
                    const saveName = this.saveSystem.loadGame(binaryData);
                    
                    onProgress?.(100, 'Game loaded successfully!');
                    
                    // Return the loaded game state with metadata
                    return {
                        saveId: save.id,
                        saveName: save.name || saveName,
                        ...save.metadata
                    };
                } catch (error) {
                    logger.warn('Error using WebAssembly load system, falling back to JavaScript:', error);
                    this._useFallback = true;
                    return this.loadGame(id, onProgress);
                }
            }
            
        } catch (error) {
            logger.error('Error loading game:', error);
            throw error;
        }
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
                        ...save,
                        // Ensure required fields are set
                        id: save.id || this._generateId(),
                        name: save.name || 'Imported Save',
                        timestamp: save.timestamp || Date.now(),
                        version: save.version || SAVE_VERSION,
                        metadata: {
                            ...save.metadata,
                            importedAt: Date.now()
                        }
                    });
                });
                
                // Update saves array
                this.saves = Array.from(existingSaves.values());
            } else {
                // Replace all saves with imported ones
                this.saves = importedSaves.map(save => ({
                    ...save,
                    // Ensure required fields are set
                    id: save.id || this._generateId(),
                    name: save.name || 'Imported Save',
                    timestamp: save.timestamp || Date.now(),
                    version: save.version || SAVE_VERSION,
                    metadata: {
                        ...save.metadata,
                        importedAt: Date.now()
                    }
                }));
            }
            
            // Save to storage
            this._saveSaves();
            return true;
            
        } catch (error) {
            logger.error('Error importing saves:', error);
            return false;
        }
    }
    
    /**
     * Updates a save file with new data
     * @private
     */
    _updateSave(id, updates) {
        const saves = this._loadSaves();
        const index = saves.findIndex(s => s.id === id);
        
        if (index === -1) return null;
        
        const updatedSave = {
            ...saves[index],
            ...updates,
            metadata: {
                ...saves[index].metadata,
                ...(updates.metadata || {})
            }
        };
        
        saves[index] = updatedSave;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saves));
        this.saves = saves;
        
        return updatedSave;
    }
                        /**
     * Updates a save file with new data
     * @private
     */
    _updateSave(id, updates) {
        const saves = this._loadSaves();
        const index = saves.findIndex(s => s.id === id);
        
        if (index === -1) return null;
        
        const updatedSave = {
            ...saves[index],
            ...updates,
            metadata: {
                ...saves[index].metadata,
                ...(updates.metadata || {})
            }
        };
        
        saves[index] = updatedSave;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saves));
        this.saves = saves;
        
        return updatedSave;
    }
    
    
    /**
     * Exports a save to a downloadable file
     * @param {string} id - The save ID to export
     * @returns {Blob} The save file as a Blob
     */
    exportSave(id) {
        const save = this.getSave(id);
        if (!save) throw new Error('Save not found');
        
        const data = {
            version: SAVE_VERSION,
            timestamp: Date.now(),
            saveName: this.saveName,
            gameState: {
                // ... existing game state
                temperatureSystem: this.temperatureSystem ? this.temperatureSystem.serialize() : null
            },
            // Add metadata about the save system used
            meta: {
                saveSystem: this._useFallback ? 'javascript' : 'wasm',
                timestamp: Date.now()
            }
        };
        
        return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    }
    
    /**
     * Imports a save from a file
     * @param {File} file - The save file to import
     * @param {boolean} [merge=true] - Whether to merge with existing saves
     * @returns {Promise<boolean>} True if import was successful
     */
    async importSave(file, merge = true) {
        try {
            const fileContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const importedSaves = JSON.parse(fileContent);
            if (!Array.isArray(importedSaves)) {
                throw new Error('Invalid save file format');
            }

            const saves = this._loadSaves();
            const existingSaves = new Map(saves.map(save => [save.id, save]));

            // Process each imported save
            importedSaves.forEach(save => {
                if (!save.id || !save.name) {
                    logger.warn('Skipping invalid save during import');
                    return;
                }

                const existingSave = existingSaves.get(save.id);
                if (existingSave && !merge) {
                    // Skip if we're not merging and save already exists
                    return;
                }

                // Update existing or add new save
                existingSaves.set(save.id, {
                    ...(existingSave || {}),
                    ...save,
                    timestamp: save.timestamp || Date.now(),
                    metadata: {
                        ...(existingSave?.metadata || {}),
                        ...(save.metadata || {})
                    }
                });
            });

            // Update saves
            this.saves = Array.from(existingSaves.values());
            this._saveSaves();
            return true;

        } catch (error) {
            logger.error('Error importing saves:', error);
            throw error;
        }
    }
}

// Create a singleton instance with lazy initialization
let _saveManagerInstance = null;

/**
 * Gets or creates the singleton instance of SaveManager
 * @param {Object} [options] - Options for the SaveManager
 * @param {Object} [options.wasmModule] - The WebAssembly module to use
 * @param {boolean} [options.useFallback=false] - Whether to use the JavaScript fallback
 * @returns {SaveManager} The SaveManager instance
 */
export function getSaveManager(options = {}) {
    if (!_saveManagerInstance) {
        _saveManagerInstance = new SaveManager(options);
    } else if (options) {
        if (options.wasmModule && !_saveManagerInstance._wasmModule) {
            _saveManagerInstance.setWasmModule(options.wasmModule);
        }
        if (options.useFallback !== undefined) {
            _saveManagerInstance._useFallback = options.useFallback;
        }
    }
    return _saveManagerInstance;
}

// For backward compatibility
export const saveManager = {
    /**
     * Gets or creates the singleton instance of SaveManager
     * @param {Object} [options] - Options for the SaveManager
     * @param {Object} [options.wasmModule] - The WebAssembly module to use
     * @param {boolean} [options.useFallback] - Whether to use the JavaScript fallback
     * @returns {SaveManager} The SaveManager instance
     */
    getInstance: (options = {}) => getSaveManager(options)
};
