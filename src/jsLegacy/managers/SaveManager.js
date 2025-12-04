import { eventBus } from '../core/EventBus.js';
import { config } from '../core/Config.js';
import { logger } from '../utils/logger.js';

/**
 * Handles saving and loading game states
 */
export class SaveManager {
  constructor() {
    this.saveSlots = 10;
    this.autoSaveInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.autoSaveTimer = null;
    this.saveVersion = '1.0.0';
    
    // Bind methods
    this.init = this.init.bind(this);
    this.saveGame = this.saveGame.bind(this);
    this.loadGame = this.loadGame.bind(this);
    this.deleteSave = this.deleteSave.bind(this);
    this.autoSave = this.autoSave.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }
  
  /**
   * Initialize the Save Manager
   */
  async init() {
    logger.info('Initializing Save Manager...');
    
    try {
      // Set up auto-save
      this.setupAutoSave();
      
      // Set up event listeners
      this.setupEventListeners();
      
      logger.info('Save Manager initialized');
      eventBus.emit('save:ready');
    } catch (error) {
      logger.error('Failed to initialize Save Manager:', error);
      throw error;
    }
  }
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Game events
    eventBus.on('game:save', this.saveGame);
    eventBus.on('game:load', this.loadGame);
    eventBus.on('game:deleteSave', this.deleteSave);
    
    // UI events
    eventBus.on('ui:saveGame', ({ slot, name }) => this.saveGame(slot, name));
    eventBus.on('ui:loadGame', ({ slot }) => this.loadGame(slot));
    eventBus.on('ui:deleteSave', ({ slot }) => this.deleteSave(slot));
  }
  
  /**
   * Set up auto-save functionality
   */
  setupAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    if (config.get('autoSaveEnabled', true)) {
      this.autoSaveTimer = setInterval(() => {
        this.autoSave();
      }, this.autoSaveInterval);
    }
  }
  
  /**
   * Get the storage key for a save slot
   * @param {number} slot - Save slot number
   * @returns {string} Storage key
   */
  getSaveKey(slot) {
    return `evolution_sim_save_${slot}`;
  }
  
  /**
   * Get the auto-save key
   * @returns {string} Auto-save key
   */
  getAutoSaveKey() {
    return 'evolution_sim_autosave';
  }
  
  
  /**
   * Save the current game state
   * @param {number} slot - Save slot number (0 for auto-save)
   * @param {string} [name] - Optional save name
   * @returns {Promise<Object>} The saved data
   */
  async saveGame(slot = 0, name = '') {
    try {
      // Get the current game state from the engine
      const gameState = await this.getGameState();
      
      if (!gameState) {
        throw new Error('No game state to save');
      }
      
      // Prepare save data
      const saveData = {
        version: this.saveVersion,
        timestamp: Date.now(),
        name: name || `Save ${slot === 0 ? 'Auto' : slot}`,
        slot,
        gameState,
        // Add any additional metadata
        metadata: {
          version: config.get('version', '1.0.0'),
          timePlayed: 0, // TODO: Track play time
          // Add more metadata as needed
        }
      };
      
      // Save to storage
      const key = slot === 0 ? this.getAutoSaveKey() : this.getSaveKey(slot);
      localStorage.setItem(key, JSON.stringify(saveData));
      
      logger.info(`Game saved to slot ${slot === 0 ? 'auto-save' : slot}`);
      eventBus.emit('save:created', { slot, name: saveData.name, timestamp: saveData.timestamp });
      
      return saveData;
    } catch (error) {
      logger.error('Failed to save game:', error);
      eventBus.emit('save:error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Auto-save the current game state
   */
  async autoSave() {
    if (!config.get('autoSaveEnabled', true)) return;
    
    try {
      await this.saveGame(0, 'Auto Save');
      logger.debug('Game auto-saved');
    } catch (error) {
      logger.error('Auto-save failed:', error);
    }
  }
  
  /**
   * Load a saved game
   * @param {number} slot - Save slot number (0 for auto-save)
   * @returns {Promise<Object>} The loaded game state
   */
  async loadGame(slot = 0) {
    try {
      const key = slot === 0 ? this.getAutoSaveKey() : this.getSaveKey(slot);
      const saveData = localStorage.getItem(key);
      
      if (!saveData) {
        throw new Error(`No save data found in slot ${slot}`);
      }
      
      // Parse and validate save data
      const parsedData = JSON.parse(saveData);
      
      if (parsedData.version !== this.saveVersion) {
        logger.warn(`Save version mismatch: ${parsedData.version} (current: ${this.saveVersion})`);
        // TODO: Implement save migration if needed
      }
      
      // Notify that a save is being loaded
      eventBus.emit('save:loading', { slot, name: parsedData.name });
      
      // Load the game state
      await this.setGameState(parsedData.gameState);
      
      logger.info(`Game loaded from slot ${slot === 0 ? 'auto-save' : slot}`);
      eventBus.emit('save:loaded', { 
        slot, 
        name: parsedData.name, 
        timestamp: parsedData.timestamp,
        metadata: parsedData.metadata
      });
      
      return parsedData;
    } catch (error) {
      logger.error('Failed to load game:', error);
      eventBus.emit('save:error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Delete a saved game
   * @param {number} slot - Save slot number
   */
  deleteSave(slot) {
    try {
      const key = this.getSaveKey(slot);
      localStorage.removeItem(key);
      
      logger.info(`Deleted save in slot ${slot}`);
      eventBus.emit('save:deleted', { slot });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete save:', error);
      eventBus.emit('save:error', { error: error.message });
      return false;
    }
  }
  
  /**
   * Get the current game state from the engine
   * @returns {Promise<Object>} The current game state
   */
  async getGameState() {
    // Request the current game state from the engine
    return new Promise((resolve) => {
      eventBus.emit('game:getState', {}, (state) => {
        resolve(state);
      });
    });
  }
  
  /**
   * Set the game state in the engine
   * @param {Object} state - The game state to load
   * @returns {Promise<void>}
   */
  async setGameState(state) {
    // Send the game state to the engine
    return new Promise((resolve, reject) => {
      eventBus.emit('game:setState', { state }, (success) => {
        if (success) {
          resolve();
        } else {
          reject(new Error('Failed to set game state'));
        }
      });
    });
  }
  
  /**
   * Get a list of all saved games
   * @returns {Array<Object>} List of saved games
   */
  getSaveGames() {
    const saves = [];
    
    // Check auto-save
    const autoSave = localStorage.getItem(this.getAutoSaveKey());
    if (autoSave) {
      try {
        const data = JSON.parse(autoSave);
        saves.push({
          slot: 0,
          name: data.name || 'Auto Save',
          timestamp: data.timestamp || 0,
          metadata: data.metadata || {}
        });
      } catch (error) {
        logger.error('Error parsing auto-save:', error);
      }
    }
    
    // Check regular save slots
    for (let i = 1; i <= this.saveSlots; i++) {
      const saveData = localStorage.getItem(this.getSaveKey(i));
      if (saveData) {
        try {
          const data = JSON.parse(saveData);
          saves.push({
            slot: i,
            name: data.name || `Save ${i}`,
            timestamp: data.timestamp || 0,
            metadata: data.metadata || {}
          });
        } catch (error) {
          logger.error(`Error parsing save slot ${i}:`, error);
        }
      }
    }
    
    // Sort by timestamp (newest first)
    saves.sort((a, b) => b.timestamp - a.timestamp);
    
    return saves;
  }
  
  /**
   * Export the current game state as a file
   * @param {string} [filename='evolution-sim-save'] - The filename to use
   */
  exportSave(filename = 'evolution-sim-save') {
    this.getGameState().then(gameState => {
      const saveData = {
        version: this.saveVersion,
        timestamp: Date.now(),
        name: filename,
        gameState,
        metadata: {
          version: config.get('version', '1.0.0'),
          exportedAt: new Date().toISOString()
        }
      };
      
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(saveData, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', dataStr);
      downloadAnchorNode.setAttribute('download', `${filename}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      
      logger.info(`Game exported as ${filename}.json`);
      eventBus.emit('save:exported', { filename });
    }).catch(error => {
      logger.error('Failed to export save:', error);
      eventBus.emit('save:error', { error: error.message });
    });
  }
  
  /**
   * Import a saved game from a file
   * @param {File} file - The file to import
   * @returns {Promise<Object>} The imported save data
   */
  importSave(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const saveData = JSON.parse(event.target.result);
          
          // Validate the save data
          if (!saveData.version || !saveData.gameState) {
            throw new Error('Invalid save file format');
          }
          
          // Handle version differences if needed
          if (saveData.version !== this.saveVersion) {
            logger.warn(`Importing save from version ${saveData.version} (current: ${this.saveVersion})`);
            // TODO: Implement save migration if needed
          }
          
          // Load the game state
          this.setGameState(saveData.gameState).then(() => {
            logger.info(`Game imported from ${file.name}`);
            eventBus.emit('save:imported', { 
              name: saveData.name || file.name,
              timestamp: saveData.timestamp || Date.now(),
              metadata: saveData.metadata || {}
            });
            resolve(saveData);
          }).catch(error => {
            reject(error);
          });
        } catch (error) {
          reject(new Error(`Failed to parse save file: ${error.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    // Remove event listeners
    eventBus.off('game:save', this.saveGame);
    eventBus.off('game:load', this.loadGame);
    eventBus.off('game:deleteSave', this.deleteSave);
    eventBus.off('ui:saveGame', this.saveGame);
    eventBus.off('ui:loadGame', this.loadGame);
    eventBus.off('ui:deleteSave', this.deleteSave);
    
    logger.info('Save Manager cleaned up');
  }
}
