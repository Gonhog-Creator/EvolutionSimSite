import { logger } from '../utils/logger.js';
import { eventBus } from '../core/EventBus.js';
import { config } from '../core/Config.js';

// Constants
const SAVE_VERSION = '2.0.0';
const SAVE_PREFIX = 'evosim_save_';
const AUTOSAVE_KEY = 'evosim_autosave';
const SAVE_SLOTS = 10;
const AUTOSAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * SaveManager handles all save/load operations for the game
 * @class
 */
class SaveManager {
    /**
     * Get the singleton instance of SaveManager
     * @param {Object} [options] - Configuration options
     * @returns {SaveManager} The singleton instance
     */
    static getInstance(options = {}) {
        if (!SaveManager.instance) {
            SaveManager.instance = new SaveManager(options);
        }
        // Update options if provided
        if (options) {
            Object.assign(SaveManager.instance, options);
        }
        return SaveManager.instance;
    }

    constructor(options = {}) {
        // Enforce singleton pattern
        if (SaveManager.instance) {
            return SaveManager.instance;
        }
        SaveManager.instance = this;
        // Core properties
        this._wasmModule = null;
        this._saveSystem = null;
        this._useFallback = false;
        this._autoSaveTimer = null;
        
        // Configuration
        this.STORAGE_KEY = 'evolution_sim_saves';
        this.autoSaveEnabled = options.autoSaveEnabled ?? true;
        this.autoSaveInterval = options.autoSaveInterval || AUTOSAVE_INTERVAL;
        this.saveSlots = options.saveSlots || SAVE_SLOTS;
        
        // Initialize save directory
        this._initializeStorage();
        
        // Load existing saves
        this.saves = this._loadSaves();
        
        // Initialize with WebAssembly module if provided
        if (options && options.wasmModule) {
            this.setWasmModule(options.wasmModule);
        } else if (options && options.useFallback) {
            this._useFallback = true;
            logger.warn('Using JavaScript fallback save system');
        } else {
            this._useFallback = false;
        }

        // Set up event listeners
        this._setupEventListeners();

        // Bind methods after everything is initialized
        this.saveGame = this.saveGame.bind(this);
        this.loadGame = this.loadGame.bind(this);
        this.deleteSave = this.deleteSave.bind(this);
        this.autoSave = this.autoSave.bind(this);
        
        // Start auto-save if enabled
        if (this.autoSaveEnabled) {
            this.setupAutoSave();
        }
    }

    // ---------------------------
    // Auto-save functionality
    // ---------------------------
    /**
     * Set up the auto-save timer
     * @private
     */
    setupAutoSave() {
        // Clear any existing auto-save timer
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }

        // If auto-save is enabled, set up a new timer
        if (this.autoSaveEnabled && this.autoSaveInterval > 0) {
            this._autoSaveTimer = setInterval(() => {
                this.autoSave().catch(error => {
                    logger.error('Auto-save interval error:', error);
                });
            }, this.autoSaveInterval);
            
            logger.debug(`Auto-save enabled with interval: ${this.autoSaveInterval}ms`);
            eventBus.emit('save:autoSaveStatus', { enabled: true, interval: this.autoSaveInterval });
        } else {
            logger.debug('Auto-save disabled');
            eventBus.emit('save:autoSaveStatus', { enabled: false });
        }
    }

    /**
     * Clean up auto-save resources
     * @private
     */
    _cleanupAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }
    /**
     * Perform an auto-save operation
     * @private
     */
    async autoSave() {
        if (!this.autoSaveEnabled) return;
        
        try {
            // Get the current game state from the app
            const app = window.app || {};
            const gameState = app.getGameState ? await app.getGameState() : {};
            
            // Save the game
            await this.saveGame(gameState, 'Auto Save', AUTOSAVE_KEY);
            
            logger.debug('Game auto-saved');
            eventBus.emit('save:autosave', { 
                timestamp: Date.now(),
                name: 'Auto Save'
            });
        } catch (error) {
            logger.error('Auto-save failed:', error);
            eventBus.emit('save:error', { 
                error: error.message,
                operation: 'autoSave'
            });
        }
    }

    // ---------------------------
    // Storage initialization
    // ---------------------------
    _initializeStorage() {
        try {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                    version: SAVE_VERSION,
                    saves: [],
                    metadata: {
                        lastUpdated: Date.now(),
                        totalSaves: 0,
                        lastSaveSlot: 0
                    }
                }));
            }
        } catch (error) {
            logger.error('Failed to initialize storage:', error);
            eventBus.emit('save:error', { error: 'Storage initialization failed' });
            throw error;
        }
    }

    // ---------------------------
    // Event listeners
    // ---------------------------
    _setupEventListeners() {
        eventBus.on('game:save', (data) => this.saveGame(data.slot, data.name));
        eventBus.on('game:load', (data) => this.loadGame(data.slot));
        eventBus.on('game:deleteSave', (data) => this.deleteSave(data.slot));

        eventBus.on('ui:saveGame', (data) => this.saveGame(data.slot, data.name));
        eventBus.on('ui:loadGame', (data) => this.loadGame(data.slot));
        eventBus.on('ui:deleteSave', (data) => this.deleteSave(data.slot));
        eventBus.on('ui:exportSave', (data) => this.exportSave(data.filename));
        eventBus.on('ui:importSave', (data) => this.importSave(data.file));

        eventBus.on('config:autoSaveChanged', (enabled) => {
            this.autoSaveEnabled = enabled;
            if (enabled) this.setupAutoSave();
            else this.stopAutoSave();
        });
    }

    // ---------------------------
    // WebAssembly loader
    // ---------------------------
    async setWasmModule(wasmModule) {
        if (!wasmModule) {
            logger.warn('No WebAssembly module provided, using fallback');
            this._useFallback = true;
            eventBus.emit('save:fallback', { reason: 'No WebAssembly module provided' });
            return;
        }

        try {
            if (typeof wasmModule.then === 'function') {
                wasmModule = await wasmModule;
            }

            try {
                const getExports = (module) => {
                    if (module.TemperatureSystem && module.SaveSystem) {
                        return {
                            TemperatureSystem: module.TemperatureSystem,
                            SaveSystem: module.SaveSystem
                        };
                    }
                    if (module.exports?.TemperatureSystem && module.exports?.SaveSystem) {
                        return {
                            TemperatureSystem: module.exports.TemperatureSystem,
                            SaveSystem: module.exports.SaveSystem
                        };
                    }
                    if (module.instance?.exports?.TemperatureSystem &&
                        module.instance?.exports?.SaveSystem) {
                        return {
                            TemperatureSystem: module.instance.exports.TemperatureSystem,
                            SaveSystem: module.instance.exports.SaveSystem
                        };
                    }
                    if (module.asm?.TemperatureSystem && module.asm?.SaveSystem) {
                        return {
                            TemperatureSystem: module.asm.TemperatureSystem,
                            SaveSystem: module.asm.SaveSystem
                        };
                    }
                    return null;
                };

                const exports = getExports(wasmModule);

                if (exports) {
                    this._wasmModule = wasmModule;
                    this._saveSystem = new exports.SaveSystem();
                    this._TemperatureSystem = exports.TemperatureSystem;
                    console.log('Successfully initialized WebAssembly save system');
                    return;
                }

                console.warn('Could not find required WebAssembly exports.');

                if (window.TemperatureSystem && window.SaveSystem) {
                    this._wasmModule = wasmModule;
                    this._saveSystem = new window.SaveSystem();
                    this._TemperatureSystem = window.TemperatureSystem;
                    return;
                }

                console.warn('Falling back to JavaScript save system');
                this._useFallback = true;

            } catch (innerError) {
                console.error('Error initializing WebAssembly module:', innerError);
                this._useFallback = true;
            }

        } catch (error) {
            console.error('WASM load fatal error:', error);
            this._useFallback = true;
        }
    }

    get saveSystem() {
        if (!this._saveSystem) {
            throw new Error('WebAssembly module not loaded. Call setWasmModule() first.');
        }
        return this._saveSystem;
    }

    // ---------------------------
    // Load saves
    // ---------------------------
    _loadSaves() {
        try {
            const savesJson = localStorage.getItem(this.STORAGE_KEY);
            if (!savesJson) return [];

            const saves = JSON.parse(savesJson);

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
                    ...(save.gameState?.temperatureData && { temperatureData: save.gameState.temperatureData }),
                    ...save.gameState
                }
            }));

        } catch (error) {
            logger.error('Error loading saves:', error);
            return [];
        }
    }

    _saveSaves() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.saves));
            return true;
        } catch (error) {
            logger.error('Error saving game:', error);
            return false;
        }
    }

    _generateId() {
        return 'save_' + Math.random().toString(36).substr(2, 9);
    }

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

    deleteSave(id) {
        const initialLength = this.saves.length;
        this.saves = this.saves.filter(save => save.id !== id);

        if (this.saves.length < initialLength) {
            this._saveSaves();
            return true;
        }
        return false;
    }

    getSave(id) {
        return this.saves.find(save => save.id === id) || null;
    }

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

    // ------------------------------------------------------------------
    // Note: The duplicated _updateSave() method has been removed here.
    // ------------------------------------------------------------------

    /**
     * Saves the current game state
     */
    async saveGame(gameState, name, saveId = null, onProgress) {
        try {
            onProgress?.(0, 'Preparing to save...');

            // Validate gameState is an object
            if (!gameState || typeof gameState !== 'object' || Array.isArray(gameState)) {
                throw new Error(`Invalid game state: expected object, got ${typeof gameState}`);
            }

            const saveName = name || gameState.saveName || `Save_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            let saveData;

            if (this._useFallback) {
                onProgress?.(50, 'Saving game (JavaScript fallback)...');

                // Create a deep clone of the game state
                const gameStateClone = JSON.parse(JSON.stringify(gameState));
                const app = this.app || window.app;

                // Only try to get temperature data if we have a valid game state
                if (app?.temperatureManager && gameStateClone && typeof gameStateClone === 'object') {
                    try {
                        const tempData = app.temperatureManager.getTemperatureData();
                        if (tempData) {
                            gameStateClone.temperatureData = tempData;
                        }
                    } catch (error) {
                        logger.error('Error getting temperature data:', error);
                        // Don't fail the save if we can't get temperature data
                    }
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
                try {
                    onProgress?.(10, 'Saving world state (WebAssembly)...');

                    let tempSystem = null;
                    if (this._TemperatureSystem) {
                        try {
                            tempSystem = new this._TemperatureSystem(
                                gameState.grid?.width || 100,
                                gameState.grid?.height || 100
                            );
                        } catch (error) {
                            logger.warn('Failed to create temperature system:', error);
                        }
                    }

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
                    logger.warn('Error using WebAssembly, falling back:', error);
                    this._useFallback = true;
                    return this.saveGame(gameState, name, saveId, onProgress);
                }
            }

            onProgress?.(90, 'Updating save index...');
            const existingIndex = this.saves.findIndex(s => s.id === (saveId || saveData.id));
            if (existingIndex >= 0) this.saves[existingIndex] = saveData;
            else this.saves.push(saveData);

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
     */
    async loadGame(id, onProgress) {
        try {
            onProgress?.(0, 'Loading save data...');

            const allSaves = this._loadSaves();
            const save = allSaves.find(s => s.id === id);

            if (!save) {
                throw new Error(`Save with ID ${id} not found`);
            }

            this.updateSave(id, {
                metadata: { lastPlayed: Date.now() }
            });

            if (this._useFallback) {
                onProgress?.(50, 'Loading game (JavaScript fallback)...');

                const gameState = {
                    grid: {
                        width: save.metadata?.width || 0,
                        height: save.metadata?.height || 0
                    },
                    creatures: save.gameState?.creatures || [],
                    simulationTime: save.metadata?.simulationTime || 0,
                    ...(save.gameState || {})
                };

                if (save.gameState?.temperatureData) {
                    gameState.temperatureData = save.gameState.temperatureData;
                }

                onProgress?.(100, 'Game loaded successfully!');

                return {
                    ...gameState,
                    saveId: save.id,
                    saveName: save.name || `Save ${new Date(save.timestamp).toLocaleString()}`,
                    ...(save.metadata || {})
                };

            } else {
                try {
                    onProgress?.(10, 'Preparing data (WebAssembly)...');

                    if (!save.binaryData) throw new Error('Invalid save format: missing binary data');

                    const binaryData = new Uint8Array(save.binaryData);
                    const saveName = this.saveSystem.loadGame(binaryData);

                    onProgress?.(100, 'Game loaded successfully!');

                    return {
                        saveId: save.id,
                        saveName: save.name || saveName,
                        ...save.metadata
                    };

                } catch (error) {
                    logger.warn('Error using WebAssembly, falling back:', error);
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
     * Imports saves
     */
    importSaves(jsonString, merge = true) {
        try {
            const importedSaves = JSON.parse(jsonString);
            if (!Array.isArray(importedSaves)) {
                throw new Error('Invalid save data format');
            }

            if (merge) {
                const existing = new Map(this.saves.map(s => [s.id, s]));

                importedSaves.forEach(save => {
                    existing.set(save.id, {
                        ...save,
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

                this.saves = Array.from(existing.values());

            } else {
                this.saves = importedSaves.map(save => ({
                    ...save,
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

            this._saveSaves();
            return true;

        } catch (error) {
            logger.error('Error importing saves:', error);
            return false;
        }
    }
}

// Create and export the singleton instance
export const saveManager = new SaveManager();
export { SaveManager };